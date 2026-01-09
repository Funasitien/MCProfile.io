import dotenv from 'dotenv'
dotenv.config()
import express from 'express'
import session from 'express-session'
import bodyParser from 'body-parser'
import ejs from 'ejs'
import rateLimit from 'express-rate-limit'
import xboxRequest from './js/xboxRequest.js'

// Routes
import lookupRouter from './routes/lookup.js'
import apiRouter from './routes/api.js'
import endpointsRouter from './routes/endpoints.js'

// Rate limiter for API and cache
const globalLimiter = rateLimit({
  windowMs: 30 * 60 * 1000, // 50 web requests we allow ( non api ) per 30min
  max: 100,
})

const port = process.env.PORT || 8888
const app = express()

// Middleware
app.set('view engine', 'ejs')
app.set('trust proxy', false)
app.use(express.static('attributes', { extensions: ['ico'] }))
app.use(express.static('attributes'))
app.use(bodyParser.json())
app.use(express.urlencoded({ extended: true }))
// Apply the global rate limiter to all routes except the API routes
app.use((req, res, next) => {
  globalLimiter(req, res, next)
})
app.use(session({
  secret: process.env.EXPRESS_SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // set this to true on production
  },
}))

app.use((req, res, next) => {
  res.locals.isAuthenticated = req.session.isAuthenticated || false
  next()
})

app.use((req, res, next) => {
  if (req.originalUrl === '/') {
    if (req.method === 'GET') {
      return lookupRouter(req, res, next)
    } else if (req.method === 'POST') {
      return lookupRouter.handle(req, res, next)
    }
  }
  next()
})

app.use('/api', apiRouter)
app.use('/endpoints', endpointsRouter)

// Error handling middleware
// Specific error handling middleware for different types of errors.
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    // Handle JSON parsing errors
    res.status(400).send('Invalid JSON')
  } else if (err) {
    // Handle all other errors
    console.error(err)
    res.status(500).send('Something went wrong')
  } else {
    next()
  }
})

// Redirect to the lookup page
app.get('/', (req, res) => {
  res.redirect('/lookup')
})

// 404 handler
app.use((req, res, next) => {
  res.status(404).render('errors/404', { title: 'Error 404' })
})

// Handle unhandled Promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`)
})

async function startInitialXboxLookup() {
  try {
    const extension = '/users/gt(KejonaMC)/profile/settings'
    await xboxRequest.requestXBLData(extension)
    console.log('Startup Xbox lookup succeeded — tokens are present in cache (or were obtained).')
  } catch (err) {
    if (err && err.code === 'MSA_DEVICE_CODE_STARTED') {
      console.log('MSA device-code authentication started at startup.')
      console.log('Follow instructions written to:', err.deviceCodeFile)
    } else {
      console.warn('Startup Xbox lookup failed (non-fatal):', err && err.message ? err.message : err)
    }
  }
}

app.listen(port, () => {
  console.log(`Web-server started on port ${port}.`)
  startInitialXboxLookup().catch((e) => {
    console.error('Error during startup Xbox lookup:', e)
  })
})