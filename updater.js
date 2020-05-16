import fs from 'fs';
import dotenv from 'dotenv';
import { updateDB, getRequestparameters, getFlights } from './crawler.js';
import { getIRedeemRepository } from './db.js';

dotenv.config();
(async () => {
  let [iRedeemRepository, sampleParams] = await Promise.all(getIRedeemRepository(), getRequestparameters());

  if (process.env.NODE_ENV == 'dev') fs.writeFileSync(
    'test_data/sampleParams.json', JSON.stringify(sampleParams));

  // let sampleParams = JSON.parse(fs.readFileSync('test_data/sampleParams.json', 'utf-8'));

  let testData = [
    ['OKA', 'YVR', '202008070000', sampleParams],
    ['OKA', 'YVR', '202008080000', sampleParams]];
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

    updateDB(flights, iRedeemRepository);

    await new Promise(resolve => setTimeout(resolve, 2000))
  }
  //TODO: remove redundant recoreds in flight table at the end

  iRedeemRepository.end();
})();
