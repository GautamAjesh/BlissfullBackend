require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const upload = require('./upload');
const fs = require('fs');


const PORT = process.env.PORT || 5001;
const SECRET_KEY = process.env.SECRET_KEY;

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const path = require('path');
const dbPath = path.join(__dirname, 'mydatabase.db');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(dbPath);


const corsOptions = {
  origin: 'https://blissfullhimalaya.com', 
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true, 
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

app.use(bodyParser.json({ limit: '50mb' }));

// Ensure only one admin exists
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  )`, (err) => {
    if (err) {
      console.error('Error creating admins table:', err.message);
    }
  });

  // Insert the admin record if it doesn't exist
  db.get('SELECT COUNT(*) AS count FROM admins', [], async (err, row) => {
    if (err) {
      console.error(err.message);
      return;
    }

    if (row.count === 0) {
      const hashedPassword = await bcrypt.hash(`${SECRET_KEY}`, 10);
      db.run('INSERT INTO admins (email, password) VALUES (?, ?)', ['admin@blissfullhimalaya.com', hashedPassword], function (err) {
        if (err) {
          console.error('Error inserting admin record:', err.message);
        } else {
          console.log('Admin record inserted.');
        }
      });
    }
  });

  // Create other tables
  db.run(`CREATE TABLE IF NOT EXISTS galleries (
    uuid TEXT PRIMARY KEY,
    name TEXT,
    image TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS blogs (
    uuid TEXT PRIMARY KEY,
    title TEXT,
    image TEXT,
    description TEXT,
    date TEXT,
    writer TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS activities (
    uuid TEXT PRIMARY KEY,
    name TEXT,
    description TEXT,
    image TEXT,
    duration TEXT,
    price REAL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS events (
    uuid TEXT PRIMARY KEY,
    title TEXT,
    image TEXT,
    date TEXT,
    description TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS articles (
    uuid TEXT PRIMARY KEY,
    title TEXT,
    images1 TEXT,
    images2 TEXT,
    images3 TEXT,
    images4 TEXT,
    description TEXT,
    cost REAL,
    duration TEXT,
    startPoint TEXT,
    endPoint TEXT
  )`, (err) => {
    if (err) {
      console.error('Error creating table:', err.message);
    } else {
      console.log('Table "articles" created or already exists.');
    }
  });

});

// Login endpoint
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;

  db.get('SELECT * FROM admins LIMIT 1', [], async (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Server error' });
    }
    if (!row || row.email !== email) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const match = await bcrypt.compare(password, row.password);
    if (match) {
      const token = jwt.sign({ email: row.email }, SECRET_KEY, { expiresIn: '1h' });
      res.json({ token });
    } else {
      res.status(401).json({ error: 'Invalid email or password' });
    }
  });
});

// CRUD routes for blogs
app.get('/api/blogs', (req, res) => {
  db.all('SELECT * FROM blogs', [], (err, rows) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/latest-blogs', (req, res) => {
  db.all('SELECT * FROM blogs ORDER BY date DESC LIMIT 3', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error fetching latest blogs' });
    res.json(rows);
  });
});

app.get('/api/blogs/:uuid', (req, res) => {
  const { uuid } = req.params;
  db.get('SELECT * FROM blogs WHERE uuid = ?', [uuid], (err, row) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Blog not found' });
    res.json(row);
  });
});

app.post('/api/blogs', (req, res) => {
  const uuid = uuidv4();
  const { title, image, description, date, writer } = req.body;
  db.run('INSERT INTO blogs (uuid, title, image, description, date, writer) VALUES (?, ?, ?, ?, ?, ?)',
    [uuid, title, image, description, date, writer],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'success', uuid });
    }
  );
});

app.put('/api/blogs/:uuid', (req, res) => {
  const { uuid } = req.params;
  const { title, image, description, date, writer } = req.body;
  db.run('UPDATE blogs SET title = ?, image = ?, description = ?, date = ?, writer = ? WHERE uuid = ?',
    [title, image, description, date, writer, uuid],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'success', changes: this.changes });
    }
  );
});

app.delete('/api/blogs/:uuid', (req, res) => {
  const { uuid } = req.params;
  db.run('DELETE FROM blogs WHERE uuid = ?', [uuid], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'success', changes: this.changes });
  });
});

// CRUD routes for galleries
app.get('/api/galleries', (req, res) => {
  db.all('SELECT * FROM galleries', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/galleries/:uuid', (req, res) => {
  const { uuid } = req.params;
  db.get('SELECT * FROM galleries WHERE uuid = ?', [uuid], (err, row) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Gallery not found' });
    res.json(row);
  });
});

app.post('/api/galleries', upload.single('image'), (req, res) => {
  const { name } = req.body;
  const image = req.file ? req.file.filename : null;

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }
  const uuid = uuidv4();
  db.run('INSERT INTO galleries (uuid, name, image) VALUES (?, ?, ?)',
    [uuid, name, image],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'success', uuid });
    }
  );
});


app.delete('/api/galleries/:uuid', (req, res) => {
  const { uuid } = req.params;

  db.get('SELECT image FROM galleries WHERE uuid = ?', [uuid], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });

    if (row && row.image) {
      const imagePath = path.join(__dirname, 'uploads', row.image);
      fs.unlink(imagePath, (err) => {
        if (err) return res.status(500).json({ error: 'Error deleting image file' });

        db.run('DELETE FROM galleries WHERE uuid = ?', [uuid], function (err) {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ message: 'success', changes: this.changes });
        });
      });
    } else {
      db.run('DELETE FROM galleries WHERE uuid = ?', [uuid], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'success', changes: this.changes });
      });
    }
  });
});

// CRUD routes for events
app.get('/api/events', (req, res) => {
  db.all('SELECT * FROM events', [], (err, rows) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/events/:uuid', (req, res) => {
  const { uuid } = req.params;
  db.get('SELECT * FROM events WHERE uuid = ?', [uuid], (err, row) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json(row);
  });
});

app.post('/api/events', (req, res) => {
  const { title, image, date, description } = req.body;
  const uuid = uuidv4();
  db.run('INSERT INTO events (uuid, title, image, date, description) VALUES (?, ?, ?, ?, ?)',
    [uuid, title, image, date, description],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'success', uuid });
    }
  );
}
);

app.put('/api/events/:uuid', (req, res) => {
  const { uuid } = req.params;
  const { title, image, date, description } = req.body;
  db.run('UPDATE events SET title = ?, image = ?, date = ?, description = ? WHERE uuid = ?',
    [title, image, date, description, uuid],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'success', changes: this.changes });
    }
  );
}
);

app.delete('/api/events/:uuid', (req, res) => {
  const { uuid } = req.params;
  db.run('DELETE FROM events WHERE uuid = ?', [uuid], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'success', changes: this.changes });
  });
}
);


//CRUD routes for activities
app.get('/api/activities', (req, res) => {
  db.all('SELECT * FROM activities', [], (err, rows) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json(rows);
  });
}
);

app.get('/api/activities/:uuid', (req, res) => {
  const { uuid } = req.params;
  db.get('SELECT * FROM activities WHERE uuid = ?', [uuid], (err, row) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json(row);
  });
}
);

app.post('/api/activities', upload.single('image'), (req, res) => {
  const { name, description, duration, price } = req.body;
  const image = req.file ? req.file.filename : null;
  if (!name || !description || !duration || !price) {
    return res.status(400).json({ error: 'All fields except image are required.' });
  }

  const uuid = uuidv4();
  db.run('INSERT INTO activities (uuid, name, description, image, duration, price) VALUES (?, ?, ?, ?, ?, ?)',
    [uuid, name, description, image, duration, price],
    function (err) {
      if (err) {
        console.error('Error inserting activity:', err);
        return res.status(500).json({ error: 'Error creating activity. Please try again later.' });
      }
      res.json({ message: 'success', uuid });
    }
  );
});

app.put('/api/activities/:uuid', upload.single('image'), (req, res) => {
  const { uuid } = req.params;
  const { name, description, duration, price } = req.body;
  const image = req.file ? req.file.filename : null;
  db.run('UPDATE activities SET name = ?, description = ?, image = ?, duration = ?, price = ? WHERE uuid = ?',
    [name, description, image, duration, price, uuid],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'success', changes: this.changes });
    }
  );
});


// Delete an activity
app.delete('/api/activities/:uuid', (req, res) => {
  const { uuid } = req.params;

  // Fetch the activity to get the image filename
  db.get('SELECT image FROM activities WHERE uuid = ?', [uuid], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });

    // Check if the image property exists and is not null
    if (row && row.image) {
      const imagePath = path.join(__dirname, 'uploads', row.image);

      // Delete the image file from the server
      fs.unlink(imagePath, (err) => {
        if (err) return res.status(500).json({ error: 'Error deleting image file' });

        // Delete the activity from the database
        db.run('DELETE FROM activities WHERE uuid = ?', [uuid], function (err) {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ message: 'success', changes: this.changes });
        });
      });
    } else {
      // If no image found, just delete the activity
      db.run('DELETE FROM activities WHERE uuid = ?', [uuid], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'success', changes: this.changes });
      });
    }
  });
});


//Curd routes for articles
app.get('/api/articles', (req, res) => {
  db.all('SELECT * FROM articles', [], (err, rows) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json(rows);
  });
}
);

app.get('/api/articles/:title', (req, res) => {
  const { title } = req.params;
  db.get('SELECT * FROM articles WHERE title = ?', [title], (err, row) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json(row);
  });
}
);

app.post('/api/articles', upload.fields([
  { name: 'images1', maxCount: 1 },
  { name: 'images2', maxCount: 1 },
  { name: 'images3', maxCount: 1 },
  { name: 'images4', maxCount: 1 },
]), (req, res) => {
  const { title, description, cost, duration, startPoint, endPoint } = req.body;
  const { images1, images2, images3, images4 } = req.files;

  if (!title || !description || !cost || !duration || !startPoint || !endPoint) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  const uuid = uuidv4();
  const imagesPath = {
    images1: images1 ? images1[0].filename : null,
    images2: images2 ? images2[0].filename : null,
    images3: images3 ? images3[0].filename : null,
    images4: images4 ? images4[0].filename : null,
  };

  db.run('INSERT INTO articles (uuid, title, images1, images2, images3, images4, description, cost, duration, startPoint, endPoint) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [uuid, title, imagesPath.images1, imagesPath.images2, imagesPath.images3, imagesPath.images4, description, cost, duration, startPoint, endPoint],
    function (err) {
      if (err) {
        console.error('Error inserting article:', err);
        return res.status(500).json({ error: 'Error creating article. Please try again later.' });
      }
      res.json({ message: 'success', uuid });
    }
  );
});

// PUT route to update an existing article with new images
app.put('/api/articles/:uuid', upload.fields([
  { name: 'images1', maxCount: 1 },
  { name: 'images2', maxCount: 1 },
  { name: 'images3', maxCount: 1 },
  { name: 'images4', maxCount: 1 },
]), (req, res) => {
  const { uuid } = req.params;
  const { title, description, cost, duration, startPoint, endPoint } = req.body;
  const { images1, images2, images3, images4 } = req.files;

  const imagesPath = {
    images1: images1 ? images1[0].filename : null,
    images2: images2 ? images2[0].filename : null,
    images3: images3 ? images3[0].filename : null,
    images4: images4 ? images4[0].filename : null,
  };

  db.run('UPDATE articles SET title = ?, images1 = ?, images2 = ?, images3 = ?, images4 = ?, description = ?, cost = ?, duration = ?, startPoint = ?, endPoint = ? WHERE uuid = ?',
    [title, imagesPath.images1, imagesPath.images2, imagesPath.images3, imagesPath.images4, description, cost, duration, startPoint, endPoint, uuid],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'success', changes: this.changes });
    }
  );
});

app.delete('/api/articles/:uuid', (req, res) => {
  const { uuid } = req.params;

  // First, fetch the image paths from the database
  db.get('SELECT images1, images2, images3, images4 FROM articles WHERE uuid = ?', [uuid], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });

    if (!row) return res.status(404).json({ error: 'Article not found' });

    // Delete image files from the filesystem
    const imagePaths = [row.images1, row.images2, row.images3, row.images4];
    imagePaths.forEach(image => {
      if (image) {
        const imagePath = path.join(__dirname, 'uploads', image);
        fs.unlink(imagePath, (err) => {
          if (err) console.error(`Error deleting file ${imagePath}: ${err.message}`);
        });
      }
    });

    // Delete the article record from the database
    db.run('DELETE FROM articles WHERE uuid = ?', [uuid], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'success', changes: this.changes });
    });
  });
});

app.use('/uploads', express.static('uploads'));

// Search endpoint
app.get('/api/search', (req, res) => {
  const { term } = req.query;

  if (!term) {
    return res.status(400).json({ error: 'Search term is required' });
  }

  // Define the query to search in blogs, articles, and activities
  const query = `
    SELECT 'blog' AS type, uuid, title AS name, description, image
    FROM blogs
    WHERE title LIKE ? OR description LIKE ?
    UNION
    SELECT 'article' AS type, uuid, title AS name, description, images1 AS image
    FROM articles
    WHERE title LIKE ? OR description LIKE ?
    UNION
    SELECT 'activity' AS type, uuid, name, description, image
    FROM activities
    WHERE name LIKE ? OR description LIKE ?
  `;

  // Prepare the search term with wildcards
  const searchTerm = `%${term}%`;

  db.all(query, [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});


app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
