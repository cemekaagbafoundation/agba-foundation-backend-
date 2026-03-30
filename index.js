require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-admin-token', 'Authorization']
}));

app.use(express.json());

app.use('/api/auth',         require('./routes/auth'));
app.use('/api/apply',        require('./routes/apply'));
app.use('/api/newsletter',   require('./routes/newsletter'));
app.use('/api/donations',    require('./routes/donations'));
app.use('/api/gallery',      require('./routes/gallery'));
app.use('/api/content',      require('./routes/content'));
app.use('/api/programs',     require('./routes/programs'));
app.use('/api/contact',      require('./routes/contact'));
app.use('/api/transparency', require('./routes/transparency'));
app.use('/api/partners',     require('./routes/partners'));
app.use('/api/hero-images',  require('./routes/heroImages'));

app.get('/', (req, res) => res.send('Agba Foundation API is running'));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
