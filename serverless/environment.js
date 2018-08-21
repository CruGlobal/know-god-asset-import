'use strict'

module.exports = () => {
  // Use dotenv to load local development overrides
  require('dotenv').config()
  return {
    ENVIRONMENT: process.env['ENVIRONMENT'] || 'development',
    S3_BUCKET_NAME: process.env['S3_BUCKET_NAME'] || 'cru-mobilecontentapi-prod'
  }
}
