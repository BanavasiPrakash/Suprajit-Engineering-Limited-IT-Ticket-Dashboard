const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const port = 5000;

app.use(cors());

// Remove whitespace from Sheet ID string
const SHEET_ID = '2534312533512068';
const TOKEN = 'cjwFTOnosztE445MUWkPPDhii6JaLHpSWdZRZ';

app.get('/api/sheet', async (req, res) => {
  try {
    const response = await axios.get(`https://api.smartsheet.com/2.0/sheets/${SHEET_ID}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching Smartsheet:', error);
    res.status(500).json({ error: 'Failed to fetch sheet data' });
  }
});

app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
});
