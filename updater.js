import fs from 'fs';
import dotenv from 'dotenv';
import { updateDB, getRequestparameters, getFlights } from './crawler.js';
import { getIRedeemRepository } from './db.js';

dotenv.config();
(async () => {
  let [iRedeemRepository, sampleParams] = await Promise.all([getIRedeemRepository(), getRequestparameters()]);

  if (process.env.NODE_ENV == 'dev') fs.writeFileSync(
    'test_data/sampleParams.json', JSON.stringify(sampleParams));

  // let sampleParams = JSON.parse(fs.readFileSync('test_data/sampleParams.json', 'utf-8'));

  let testData = [
    ['HKG', 'YYZ', '2020-08-07', sampleParams],
    ['HKG', 'YYZ', '2020-08-08', sampleParams],
    ['HKG', 'YYZ', '2020-08-09', sampleParams]];
  for (let i = 0; i < testData.length; i++) {
    let testDataDir;
    if (process.env.NODE_ENV == 'dev') {
      testDataDir = 'test_data/' +
        testData[i].reduce((p, c, i, a) => (i == a.length - 1) ? p : `${p}_${c}`);
      if (!fs.existsSync(testDataDir)) fs.mkdirSync(testDataDir);
    }

    let flights = await getFlights.apply(null, testData[i]);
    if (process.env.NODE_ENV == 'dev') {
      fs.writeFileSync(`${testDataDir}/allFlights.json`, JSON.stringify(flights));
    }

    await Promise.all(
      [updateDB(testData[i][0], testData[i][1], testData[i][2], flights, iRedeemRepository),
      new Promise(resolve => setTimeout(resolve, 1000))]);
  }
  //TODO: remove redundant recoreds in DB at the end

  iRedeemRepository.end();
})();
