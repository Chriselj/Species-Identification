const mysql = require('mysql2');
const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

// Apply rate-limiting middleware to all routes
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Limit each IP to 100 requests per windowMs
});

app.use(limiter);

// Global variable to track processed image filenames
let processedImageFilenames = [];

// Add express.json() middleware to parse request bodies as JSON
app.use(express.json());

// Function to test the MySQL connection
function testConnection() {
  pool.getConnection((error, connection) => {
    if (error) {
      console.error('Error connecting to MySQL:', error);
    } else {
      console.log('Connected to MySQL successfully.');
      connection.release(); // Release the connection back to the pool
    }
  });
}
// API endpoint to handle identification submissions
app.post('/submitIdentification', async (req, res) => {
  const { imageFilename, species } = req.body;

  // Check if the "images" folder is empty
  const numberOfImages = await getNumberOfImages();
  if (numberOfImages === 0) {
    console.log('No more images left to process.');
    return res.status(404).json({ success: false, message: 'Currently no images left to process.' });
  }

  const insertQuery = `INSERT INTO observations (image_filename, species, votes) VALUES (?, ?, 1)`;
  const values = [imageFilename, species];

  pool.getConnection((error, connection) => {
    if (error) {
      console.error('Error getting connection from pool:', error);
      return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }

    connection.query(insertQuery, values, (error, result) => {
      connection.release(); // Release the connection back to the pool

      if (error) {
        console.error('Error inserting user submission:', error);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
      }

      console.log('User submission inserted successfully.');

      // Check if the species folder exists, if not, create one
      createSpeciesFolder(species);

      // Check the vote count for the species
      const voteCount = result.insertId;

      // Check if the vote count reaches a certain threshold (e.g., 2 votes)
      if (voteCount >= 2) {
        // Move the image to the species folder
        moveImageToSpeciesFolder(imageFilename, species);
      }

      return res.status(200).json({ success: true, message: 'User submission inserted successfully.' });
    });
  });
});




const publicDirectory = path.join(__dirname, 'public');
app.use(express.static(publicDirectory));

const imagesDirectory = path.join (publicDirectory,'images');

const pool = mysql.createPool({
  host: '10.22.16.136', // Use the IP address of the MySQL container
  port: '3307', // Use the mapped port
  user: 'WebUser',
  password: 'Web1234',
  database: 'webappdatabase',
  connectionLimit: 10, // Set the maximum number of connections in the pool
});

pool.getConnection((error, connection) => {
  if (error) {
    console.error('Error connecting to MySQL:', error);
  } else {
    console.log('Connected to MySQL successfully.');
    connection.release(); // Release the initial connection as it was just used for testing
  }
});

testConnection(); // Test the connection on application startup

app.get('/', (req, res) => {
  res.sendFile(path.join(publicDirectory, 'index.html'));
});

// API endpoint to get the number of images in the "images" folder
// Function to get the number of images in the "images" directory using async/await
async function getNumberOfImages() {
  const imagesDirectory = path.join(__dirname, 'public/images');

  try {
    const files = await fs.promises.readdir(imagesDirectory);
    // Filter image files based on file extensions (if needed)
    const imageFilenames = files.filter(file => {
      const extension = file.split('.').pop().toLowerCase();
      return ['jpg', 'jpeg', 'png', 'gif'].includes(extension);
    });

    return imageFilenames.length; // Return the number of images in the "images" directory
  } catch (err) {
    console.error('Error reading images directory:', err);
    return 0; // Return 0 images in case of an error
  }
}

// API endpoint to get the number of images in the "images" folder
app.get('/getNumberOfImages', async (req, res) => {
  const numberOfImages = await getNumberOfImages();
  console.log('Number of images:', numberOfImages);
  res.json({ numberOfImages });
});



// API endpoint to get a random image filename
app.get('/getRandomImage', (req, res) => {
  const imagesDirectory = path.join(__dirname, 'public/images');

  fs.readdir(imagesDirectory, (err, files) => {
    if (err) {
      console.error('Error reading images directory:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }

    // Filter image files based on file extensions (if needed)
    const imageFilenames = files.filter(file => {
      const extension = file.split('.').pop().toLowerCase();
      return ['jpg', 'jpeg', 'png', 'gif'].includes(extension);
    });

    if (imageFilenames.length === 0) {
      // No more images available to process
      console.log('No images left to process.');
      return res.status(404).json({ message: 'Currently no images left to process.' });
    }

    // Get a random image filename
    const randomImageFilename = imageFilenames[Math.floor(Math.random() * imageFilenames.length)];

    // Set the response content type to JSON
    res.setHeader('Content-Type', 'application/json');

    // Send the JSON data containing the random image filename
    console.log('Random image filename:', randomImageFilename);
    res.json({ randomImageFilename });
  });
});



// Function to sanitize a string for use as a folder or file name
function sanitizeFileName(name) {
  // Replace spaces with underscores and remove special characters
  return name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '');
}

// Function to create a folder for a species
function createSpeciesFolder(species) {
  const encodedSpeciesName = encodeURIComponent(species);
  const speciesFolder = path.join(imagesDirectory, encodedSpeciesName);
  if (!fs.existsSync(speciesFolder)) {
    fs.mkdirSync(speciesFolder);
    console.log(`Species folder "${species}" created.`);
  }
}

// Function to move an image to a species folder
function moveImageToSpeciesFolder(imageFilename, species) {
  const decodedImageFilename = decodeURIComponent(imageFilename);
  const sourceImagePath = path.join(imagesDirectory, decodedImageFilename);
  const targetSpeciesPath = path.join(imagesDirectory, encodeURIComponent(species));
  const targetImagePath = path.join(targetSpeciesPath, decodedImageFilename);

  console.log('Source image path:', sourceImagePath);

  // Check if the target species directory exists, if not, create it
  if (!fs.existsSync(targetSpeciesPath)) {
    fs.mkdirSync(targetSpeciesPath, { recursive: true });
    console.log(`Species folder "${species}" created.`);
  }

  // Create a read stream from the source image file
  const readStream = fs.createReadStream(sourceImagePath);

  // Create a write stream to the target species folder
  const writeStream = fs.createWriteStream(targetImagePath);

  // Use the 'pipe' method to copy the image
  readStream.pipe(writeStream);

  // Listen for 'finish' event to know when the copy is complete
  writeStream.on('finish', () => {
    console.log(`Image "${decodedImageFilename}" copied to ${species} folder.`);
    // Delete the original file after the copy is successful
    fs.unlinkSync(sourceImagePath);
    console.log(`Image "${decodedImageFilename}" removed from the root directory.`);
  });

  // Listen for 'error' event in case there is an issue with the copy
  writeStream.on('error', (err) => {
    console.error('Error copying image:', err);
  });

  // Add the processed image filename to the global variable
  processedImageFilenames.push(decodedImageFilename);
}




const port = 3000;
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
