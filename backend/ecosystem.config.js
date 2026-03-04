module.exports = {
  apps: [
    {
      name: 'crm-sobei-backend',
      script: 'src/server.js',
      cwd: __dirname,

      // enable automatic restarts when code changes (development only)
      watch: ['src'],

      env: {
        NODE_ENV: 'development',
        PORT: 4000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 4000
      }
    }
  ]
};
