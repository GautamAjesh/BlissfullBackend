const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./mydatabase.db');

const getBlogByUuid = (uuid) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM blogs WHERE uuid = ?', [uuid], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
};

module.exports = {
  getBlogByUuid,
};
