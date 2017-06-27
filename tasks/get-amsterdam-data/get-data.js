//-------------------------------------------------
// Info
//-------------------------------------------------
// This approach focuses on making as few requests to the Netamo API as possible.
// It does this by getting all the data for a single station in one go. It will still need to do a separate request
// for each variable, but let's say you need a month's worth of data at 1 hour resolution then this will only be
// 744 (24*31) obs, which can be all go in a single API request. Thus to get temp, humidity and rain for a whole
// month for one station this will only use up 3 API requests. 


//-------------------------------------------------
// Dependencies
//-------------------------------------------------
const netBud   = require('../../utils/netatmo-buddy');
const async    = require('async');


//-------------------------------------------------
// Config
//-------------------------------------------------
const config = require('../../config/config.js').netatmo;

const creds = {
  client_id: config.clientId,
  client_secret: config.clientSecret,
  username: config.username,
  password: config.password
};

// Set the period over which you require data.
const startDay = '2016-09-01';
const endDay = '2016-09-31'; // <- This end day is included

// Set some of the parameters for the netatmo getmeasures request
const measureParams = {
  date_begin: new Date(startDay).getTime() / 1000,
  date_end  : ((new Date(endDay).getTime()) / 1000) + (24 * 60 * 60),
  scale: '1hour', // max, 30min, 1hour, 3hours, 1day, 1week, 1month
};
// The access token, type, device_id, and module_id fields will be set in due course later. The optimize field
// is fixed as 'false' by the netamo-buddy module.

// Set Bounding Box
// Amsterdam
const publicParams = {
  lat_ne: 52.427417,
  lon_ne: 4.978180,
  lat_sw: 52.280630,
  lon_sw: 4.717255,
  filter: true // Filter out 'not relevent' stations. Weirdly when true you can end up with more stations!
};

// Set the filename/path for the station list csv (may already exist)
const csvFile4Stations = `${__dirname}/data/stations.csv`;
const csvFile4Obs = `${__dirname}/data/net_${startDay}_to_${endDay}.csv`;

// Does a station list already exist that we want to load rather that get a new list?
const useExistingList = false;

// Set what variables you would like data for
const variables = ['temperature']; // e.g. 'temperature', 'humidity', 'sum_rain'


//-------------------------------------------------
// Get Access Token
//-------------------------------------------------
netBud.getToken(creds, (err, token) => {

  if (err) throw err;

  // Add the access token to the parameter objects
  publicParams.access_token  = token;
  measureParams.access_token = token;

  //-------------------------------------------------
  // Get Station List
  //-------------------------------------------------
  netBud.getStationList(useExistingList, csvFile4Stations, publicParams, (err, statList) => {

    if (err) throw err;

    console.log(`\nRetrieved ${statList.length} stations from ${useExistingList ? 'csv file.' : 'netamo API.\n'}`);

    // Create an array to fill with the formatted data, each object within will be a row in the final csv file.
    const mergedData = [];

    //-------------------------------------------------
    // Loop over stations
    //-------------------------------------------------
    async.eachSeries(statList, (station, sCallback) => {

      console.log(`Processing station: ${station.device_id}`);

      //-------------------------------------------------
      // Get the data
      //-------------------------------------------------
      // For this station get all its observations, for all the variables, between the start and end dates, this
      // multipleVars function will output the data in a nicer format to work with.
      netBud.multipleVars(station, measureParams, variables, (err, sObs) => {

        if (err) throw err;
        
        //-------------------------------------------------
        // Format and summarise the data
        //-------------------------------------------------
        // Add the data to our array with data for all the stations combined, which will eventually be used to make
        // our csv file.
        sObs.forEach((dayData) => {
          mergedData.push(dayData);
        });

        // To prevent hitting the api request limit let's pause before moving onto the next station.
        const pauseInSeconds = 0.3;
        setTimeout(() => {
          return sCallback();
        }, pauseInSeconds * 1000);        

      }); 

    }, (err) => { 

      if (err) throw err;

      // Save the data as a csv file
      console.log('\nSaving to csv');
      netBud.docs2csv(mergedData, csvFile4Obs);

    });//<-- loop over stations 

  });//<-- getStationList

});//<-- Get token


















