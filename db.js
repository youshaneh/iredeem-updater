import mysql from 'mysql';

class IRedeemRepository {
  constructor(connection) {
    this.connection = connection;
  }

  addFlight({ airline, flight_number, aircraft,
    status_f, status_b, status_n, status_r,
    departure_airport, departure_terminal, departure_time,
    arrival_airport, arrival_terminal, arrival_time }) {
    return new Promise((resolve, reject) => {
      this.connection.query(`INSERT INTO flight(
        airline, flight_number, aircraft,
        status_f, status_b, status_n, status_r,
        departure_airport, departure_terminal, departure_time,
        arrival_airport, arrival_terminal, arrival_time)
        VALUES(?,?,?,?,?,?,?,
          ?,?,?,
          ?,?,?);`,
        [airline, flight_number, aircraft,
          status_f, status_b, status_n, status_r,
          departure_airport, departure_terminal, departure_time,
          arrival_airport, arrival_terminal, arrival_time],
        (error, result) => {
          if (error) {
            reject(error);
          }
          else {
            resolve(result);
          }
        }
      );
    });
  }

  addHistory({ id: flight_id, update_time,
    status_f, status_b, status_n, status_r }) {
    return new Promise((resolve, reject) => {
      this.connection.query(`INSERT INTO history(
        flight_id, update_time,
        status_f, status_b, status_n, status_r)
        VALUES(?,?,?,?,?,?);`,
        [flight_id, update_time,
          status_f, status_b, status_n, status_r],
        (error, result) => {
          if (error) {
            reject(error);
          }
          else {
            resolve(result);
          }
        }
      );
    });
  }

  isStatusChanged(currentStatus, lastStatus) {
    return (currentStatus.status_f != lastStatus.status_f) ||
      (currentStatus.status_b != lastStatus.status_b) ||
      (currentStatus.status_n != lastStatus.status_n) ||
      (currentStatus.status_r != lastStatus.status_r);
  }

  async updateInterval(from, to, date, itineraries) {
    this.connection.beginTransaction(function (err) {
      if (err) { throw err; }
    });
    try {
      await this.removeItineraries(from, to, date);
      await this.addItinerarys(itineraries);
    }
    catch (e) {
      this.connection.rollback(() => { throw e });
    }
    this.connection.commit(function (err) {
      if (err) return connection.rollback(() => { throw err });
    });
  }

  removeItineraries(from, to, date) {
    return new Promise((resolve, reject) => {
      this.connection.query(`DELETE itinerary FROM itinerary
          JOIN flight AS f1 ON itinerary.flight1 = f1.id
          LEFT JOIN flight AS f2 ON itinerary.flight2 = f2.id
        WHERE
          f1.departure_airport = ?
          AND ((f1.arrival_airport = ? AND f2.departure_airport IS NULL)
          OR f2.arrival_airport = ?)
          AND f1.departure_time >= ?
          AND f1.departure_time < DATE_ADD(?, INTERVAL 1 DAY);`,
        [from, to, to, date, date],
        (error, result) => {
          if (error) {
            reject(error);
          }
          else {
            resolve(result);
          }
        }
      );
    })
  }

  async addItinerarys(itineraries) {
    for (let i = 0; i < itineraries.length; i++) {
      await this.addItinerary(itineraries[i]);
    }
  }

  async addItinerary([flight1, flight2]) {
    let flightId1 = await this.insertOrUpdateFlight(flight1);
    let flightId2 = flight2 ? await this.insertOrUpdateFlight(flight2) : undefined;
    return new Promise((resolve, reject) => {
      this.connection.query(`INSERT INTO itinerary(flight1, flight2) VALUES(?,?);`,
        [flightId1, flightId2],
        (error, result) => {
          if (error) {
            reject(error);
          }
          else {
            resolve(result);
          }
        }
      );
    })
  }

  async insertOrUpdateFlight(flight) {
    let storedFlight = await this.getFlight(flight);
    if (!storedFlight) {
      return this.addFlight(flight).then(flight => flight.insertId);
    }
    else {
      if (this.isStatusChanged(flight, storedFlight)) await this.addHistory(storedFlight);
      await this.updateFlightStatus(flight);
    }
    return storedFlight.id;
  }

  updateFlightStatus({ airline, flight_number, departure_time,
    status_f, status_b, status_n, status_r }) {
    return new Promise((resolve, reject) => {
      this.connection.query(`UPDATE flight SET
        status_f = ?, status_b = ?, status_n = ?, status_r = ?
        WHERE airline = ? AND flight_number = ?
        AND departure_time = ?;`,
        [status_f, status_b, status_n, status_r,
          airline, flight_number, departure_time],
        (error, result) => {
          if (error) {
            reject(error);
          }
          else {
            resolve();
          }
        }
      );
    });
  }

  getFlight({ airline, flight_number, departure_time }) {
    return new Promise((resolve, reject) => {
      this.connection.query(`SELECT * from flight
        where airline = ? AND flight_number = ? AND
        departure_time = ?`,
        [airline, flight_number, departure_time],
        (error, result) => {
          if (error) {
            reject(error);
          }
          else {
            resolve(result[0]);
          }
        });
    });
  }

  end() {
    this.connection.end();
  }
}

export async function getIRedeemRepository(retry = 5) {
  try {
    let connection = mysql.createConnection({
      host: 'localhost',
      port: 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: 'iredeem'
    });
    return await new Promise((resolve, reject) => {
      connection.connect(e => {
        if (e) {
          reject(e);
        }
        else {
          console.info('connected to database');
          resolve(new IRedeemRepository(connection));
        }
      });
    });
  }
  catch (e) {
    if (retry < 0) throw e;
    console.error(e);
    return await getIRedeemRepository(retry - 1);
  }
}
