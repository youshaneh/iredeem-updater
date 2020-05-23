import fs from 'fs';
import dotenv from 'dotenv';
import { updateDB, initBrowserPage, getRequestParameters, setupAndGetRequestParameters, getFlights } from './crawler.js';
import { getIRedeemRepository } from './db.js';

dotenv.config();
let airports = JSON.parse(fs.readFileSync('available-airports.json', 'utf-8'));
let catchUp = '';
(async function update(){
  try{
    let [iRedeemRepository] = await Promise.all([
      getIRedeemRepository(),
      initBrowserPage().then(setupAndGetRequestParameters)]);
    while (true) {
      let today = new Date();
      let from = 'HKG';
      for (let airport of airports) {
        let to = airport[2];
        if (catchUp) {
          if (to != catchUp) {
            continue;
          }
          else {
            catchUp = null;
          }
        }
        for (let i = 3; i <= 60; i++) {
          let date = new Date(today.getTime() + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          let flights;
          try {
            flights = await getFlights(from, to, date);
          }
          catch (e) {
            if(e.message != 'Request quota is used up') console.error(e);
            await getRequestParameters();
            flights = await getFlights(from, to, date);
          }
          if (process.env.NODE_ENV == 'dev') {
            let testDataDir = `test_data/`;
            if (process.env.NODE_ENV == 'dev' && !fs.existsSync(testDataDir)) fs.mkdirSync(testDataDir);
            fs.writeFileSync(`${testDataDir}/${from}_${to}_${date}_flights.json`, JSON.stringify(flights));
          }
          await updateDB(from, to, date, flights, iRedeemRepository);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    //TODO: remove redundant recoreds in DB at the end
  }
  catch(e){
    console.error(e);
    update();
  }
})();
