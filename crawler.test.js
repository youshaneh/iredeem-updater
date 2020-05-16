import fs from 'fs';
import {getAvailableFlights} from './crawler';

describe('Application module', function () {
  it('should output the correct error', () => {
    let flights = JSON.parse(fs.readFileSync('scratch2/flights_202007010000.json', 'utf-8'))
    getAvailableFlights(flights);
  });
});