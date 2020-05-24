import fs from 'fs';
import dotenv from 'dotenv';
import { updateDB, initBrowserPage, getRequestParameters, setupAndGetRequestParameters, getFlights } from './crawler.js';
import { getIRedeemRepository } from './db.js';

dotenv.config();
let routes = JSON.parse(fs.readFileSync('routes.json', 'utf-8'));
let resume = false;
let lastRoute;
(async function update() {
  try {
    let [iRedeemRepository] = await Promise.all([
      getIRedeemRepository(),
      initBrowserPage().then(setupAndGetRequestParameters)]);
    while (true) {
      let today = new Date();
      for (let route of routes) {
        for (let { from, to } of [{ from: route[0], to: route[1] }, { from: route[1], to: route[0] }]) {
          for (let i = 3; i <= 60; i++) {
            let date = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
            if (resume) {
              if (from != lastRoute.from || to != lastRoute.to || date < lastRoute.date) continue;
              resume = false;
            }
            lastRoute = { from, to, date };
            date = date.toISOString().split('T')[0];
            let flights;
            try {
              flights = await getFlights(from, to, date);
            }
            catch (e) {
              if (e.message != 'Request quota is used up') console.error(e);
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
      //TODO: remove outdated recoreds in DB at the end
    }
  }
  catch (e) {
    console.error(e);
    resume = lastRoute != undefined;
    update();
  }
})();
