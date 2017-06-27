# Netatmo Data Downloader

Code for downloading public weather data from the [Netatmo API](https://dev.netatmo.com/resources/technical/reference/weatherapi/getpublicdata).

## Setup

1. Clone this repository to your local machine.
2. If you haven't already, install a recent version of [Node.js](https://nodejs.org) (needs to be a version with ES6 support), and [NPM](https://www.npmjs.com/).
3. Go into the root of the _netatmo-data-downloader_ directory.
4. Use ```npm install``` to download required packages.
5. In order to authenticate with the Netatmo API you will need to specify your Netatmo developer credentials. If you haven't already set up a [Netatmo Developer Account](https://dev.netatmo.com/myaccount/).
6. Once logged in the _Technical Parameters_ section will list the _Client id_ and _Client secret_ you will need.
7. Create a file called ```.env``` in the root of the _netatmo-data-downloader_ directory.
8. Enter your Netatmo username and password, along with the client id and secret, in this file as follows:

```
NETATMO_CLIENT_ID=YourClientIdHere
NETATMO_CLIENT_SECRET=YourClientSecretHere
NETATMO_USERNAME=YourEmailAddress@email.com
NETATMO_PASSWORD=YourSuperSecretPassword
``` 

9. The code will load these details into _process.env_ in order to configure the code. 
10. This code is currently set up to just get temperature data for Amsterdam for Sept 2016. To do this run ```npm run get-amsterdam```. If you look at the _package.json_ file you will see that all this is doing is running ```node tasks/get-amsterdam-data/get-data.js```. If successful the data is saved to csv files in _tasks/get-amsterdam-data/data_.
11. If you wish to edit the timeframe, location, variables, etc, then edit the file _/tasks/get-amsterdam-data/get-data.js_
12. Alternatively create a new folder in the _/tasks/_ directory and use the Amsterdam code as a basis for your own custom script.


## TODOs

- At some point I'd like to update the code to use Promises instead of Callbacks as starting to see **Callback Hell!**.
- Would also be nice if all the data wasn't held in memory, i.e. data should be continually piped into the csv rather than waiting till all the data has been retrieved from the API before saving. 