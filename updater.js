import fs from 'fs';
import dotenv from 'dotenv';
import { getRequestparameters, getFlights } from './crawler.js';

dotenv.config();
(async () => {
  let sampleParams = await getRequestparameters();
  getFlights(undefined, undefined, undefined, sampleParams);
})();
