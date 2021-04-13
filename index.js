import fs from 'fs';
import dotenv from 'dotenv';
import { initBrowserPage, getRequestParameters, setupAndGetRequestParameters, getFlights } from './scraper.js';
import { getIRedeemRepository } from './db.js';

dotenv.config();
const routes = JSON.parse(fs.readFileSync('routes.json', 'utf-8'));

(async function update() {
    let continueFrom;
    while (true) {
        let lastRoute;
        try {
            let [iRedeemRepository] = await Promise.all([getIRedeemRepository(), initBrowserPage().then(setupAndGetRequestParameters)]);
            while (true) {
                iRedeemRepository.deleteOutdatedData();
                let today = new Date();
                today.setHours(8, 0, 0, 0);
                for (let route of routes) {
                    for (let [from, to] of [[route[0], route[1]], [route[1], route[0]]]) {
                        if (continueFrom && (from != continueFrom.from || to != continueFrom.to)) continue;
                        for (let i = 0; i <= 90; i++) {
                            let date = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
                            if (continueFrom) {
                                if (date < continueFrom.date) continue;
                                continueFrom = null;
                            }
                            lastRoute = { from, to, date };
                            date = date.toISOString().split('T')[0];
                            let flights;
                            flights = await getFlights(from, to, date);
                            if (process.env.NODE_ENV == 'dev') {
                                let testDataDir = `test_data/`;
                                if (!fs.existsSync(testDataDir)) fs.mkdirSync(testDataDir);
                                fs.writeFileSync(`${testDataDir}/${from}_${to}_${date}_flights.json`, JSON.stringify(flights));
                            }
                            let itineraries = getItineraries(flights);
                            await iRedeemRepository.updateInterval(from, to, date, itineraries);

                            await new Promise(resolve => setTimeout(resolve, 3000));
                        }
                    }
                }
            }
        } catch (e) {
            console.error(e);
            continueFrom = lastRoute;
        }
    }
})();

function getItineraries(receivedItineraries) {
    let itineraries = [];
    receivedItineraries.forEach(receivedItinerary => {
        let itinerary = [];
        receivedItinerary.segments.forEach(receivedFlight => {
            let airline = receivedFlight.flightIdentifier.marketingAirline;
            let flight_number = receivedFlight.flightIdentifier.flightNumber;
            let aircraft = receivedFlight.equipment;
            let status_f = receivedFlight.cabins?.F?.status || 'X';
            let status_b = receivedFlight.cabins?.B?.status || 'X';
            let status_r = receivedFlight.cabins?.R?.status || 'X';
            let status_n = receivedFlight.cabins?.N?.status || 'X';
            let [departure_terminal, departure_airport] = receivedFlight.originLocation.split('_');
            let departure_time = new Date(receivedFlight.flightIdentifier.originDate)
                .toISOString().slice(0, 19).replace('T', ' ');
            let [arrival_terminal, arrival_airport] = receivedFlight.destinationLocation.split('_');
            let arrival_time = new Date(receivedFlight.destinationDate)
                .toISOString().slice(0, 19).replace('T', ' ');
            let flight = {
                airline,
                flight_number,
                aircraft,
                status_f,
                status_b,
                status_r,
                status_n,
                departure_airport,
                departure_terminal,
                departure_time,
                arrival_airport,
                arrival_terminal,
                arrival_time
            };
            itinerary.push(flight);
        });
        itineraries.push(itinerary);
    });
    return itineraries;
}