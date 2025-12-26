/**
 * Database utility module - supports both PostgreSQL (production) and file-based storage (development)
 */

const { Pool } = require('pg');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');

class Database {
  constructor() {
    this.isProduction = process.env.NODE_ENV === 'production';
    this.pool = null;
    this.newsHistoryFile = path.join(__dirname, '..', 'data', 'news-history.json');
    this.rateProbabilitiesFile = path.join(__dirname, '..', 'data', 'rate-probabilities.json');
    this.usersFile = path.join(__dirname, '..', 'users.json');

    if (this.isProduction) {
      this.initPostgres();
    }
  }

  /**
   * Initialize PostgreSQL connection pool
   */
  initPostgres() {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      console.error('DATABASE_URL not found in environment variables');
      return;
    }

    this.pool = new Pool({
      connectionString: databaseUrl,
      ssl: process.env.NODE_ENV === 'production' ? {
        rejectUnauthorized: false
      } : false
    });

    console.log('PostgreSQL connection pool initialized');
  }

  /**
   * Create news_history table if it doesn't exist
   */
  async createNewsHistoryTable() {
    if (!this.isProduction || !this.pool) {
      return; // Skip in development mode
    }

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS news_history (
        id SERIAL PRIMARY KEY,
        headline TEXT NOT NULL,
        timestamp TIMESTAMPTZ,
        economic_data JSONB,
        tags TEXT[],
        has_chart BOOLEAN DEFAULT false,
        link TEXT,
        raw_text TEXT,
        is_critical BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT false,
        class_name TEXT,
        first_seen_at BIGINT NOT NULL,
        scraped_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(headline, timestamp)
      );

      CREATE INDEX IF NOT EXISTS idx_first_seen_at ON news_history(first_seen_at);
      CREATE INDEX IF NOT EXISTS idx_is_critical ON news_history(is_critical);
    `;

    try {
      await this.pool.query(createTableQuery);
      console.log('News history table created successfully');
    } catch (error) {
      console.error('Error creating news history table:', error);
      throw error;
    }
  }

  /**
   * Create interest_rate_probabilities table if it doesn't exist
   */
  async createRateProbabilityTable() {
    if (!this.isProduction || !this.pool) {
      return; // Skip in development mode
    }

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS interest_rate_probabilities (
        id SERIAL PRIMARY KEY,
        central_bank VARCHAR(10) NOT NULL,
        currency VARCHAR(3) NOT NULL,
        current_rate DECIMAL(5,2),
        next_meeting TIMESTAMPTZ NOT NULL,
        prob_hike DECIMAL(5,2),
        prob_hold DECIMAL(5,2),
        prob_cut DECIMAL(5,2),
        expected_change DECIMAL(5,2),
        next_expected_move VARCHAR(10),
        timeline JSONB,
        week_ago_data JSONB,
        data_source TEXT,
        last_updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(central_bank, next_meeting)
      );

      CREATE INDEX IF NOT EXISTS idx_central_bank ON interest_rate_probabilities(central_bank);
      CREATE INDEX IF NOT EXISTS idx_last_updated ON interest_rate_probabilities(last_updated);
    `;

    try {
      await this.pool.query(createTableQuery);
      console.log('Interest rate probabilities table created successfully');
    } catch (error) {
      console.error('Error creating interest rate probabilities table:', error);
      throw error;
    }
  }

  /**
   * Load news history from database or file
   */
  async loadNewsHistory() {
    if (this.isProduction && this.pool) {
      return await this.loadFromPostgres();
    } else {
      return this.loadFromFile();
    }
  }

  /**
   * Load news history from PostgreSQL
   */
  async loadFromPostgres() {
    try {
      const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

      const result = await this.pool.query(
        `SELECT * FROM news_history
         WHERE first_seen_at > $1
         ORDER BY first_seen_at DESC`,
        [oneWeekAgo]
      );

      const newsItems = result.rows.map(row => ({
        headline: row.headline,
        timestamp: row.timestamp,
        economicData: row.economic_data,
        tags: row.tags || [],
        hasChart: row.has_chart,
        link: row.link,
        rawText: row.raw_text,
        isCritical: row.is_critical,
        isActive: row.is_active,
        className: row.class_name,
        firstSeenAt: parseInt(row.first_seen_at),
        scrapedAt: row.scraped_at
      }));

      console.log(`Loaded ${newsItems.length} news items from PostgreSQL`);
      return newsItems;
    } catch (error) {
      console.error('Error loading from PostgreSQL:', error);
      return [];
    }
  }

  /**
   * Load news history from JSON file (development mode, async)
   */
  async loadFromFile() {
    try {
      if (fs.existsSync(this.newsHistoryFile)) {
        const data = await fsPromises.readFile(this.newsHistoryFile, 'utf8');
        const newsItems = JSON.parse(data);
        console.log(`Loaded ${newsItems.length} news items from file`);
        return newsItems;
      }
      return [];
    } catch (error) {
      console.error('Error loading from file:', error);
      return [];
    }
  }

  /**
   * Save news history to database or file
   */
  async saveNewsHistory(newsItems) {
    if (this.isProduction && this.pool) {
      await this.saveToPostgres(newsItems);
    } else {
      await this.saveToFile(newsItems);
    }
  }

  /**
   * Save news history to PostgreSQL
   */
  async saveToPostgres(newsItems) {
    try {
      // Delete old items (older than 1 week)
      const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      await this.pool.query(
        'DELETE FROM news_history WHERE first_seen_at < $1',
        [oneWeekAgo]
      );

      // Insert or update news items
      for (const item of newsItems) {
        await this.pool.query(
          `INSERT INTO news_history
           (headline, timestamp, economic_data, tags, has_chart, link, raw_text,
            is_critical, is_active, class_name, first_seen_at, scraped_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (headline, timestamp) DO UPDATE SET
           economic_data = EXCLUDED.economic_data,
           tags = EXCLUDED.tags,
           has_chart = EXCLUDED.has_chart,
           link = EXCLUDED.link,
           raw_text = EXCLUDED.raw_text,
           is_critical = EXCLUDED.is_critical,
           is_active = EXCLUDED.is_active,
           class_name = EXCLUDED.class_name`,
          [
            item.headline,
            item.timestamp,
            JSON.stringify(item.economicData),
            item.tags,
            item.hasChart,
            item.link,
            item.rawText,
            item.isCritical,
            item.isActive,
            item.className,
            item.firstSeenAt,
            item.scrapedAt
          ]
        );
      }

      console.log(`Saved ${newsItems.length} news items to PostgreSQL`);
    } catch (error) {
      console.error('Error saving to PostgreSQL:', error);
    }
  }

  /**
   * Save news history to JSON file (development mode, async)
   */
  async saveToFile(newsItems) {
    try {
      const dataDir = path.join(__dirname, '..', 'data');
      if (!fs.existsSync(dataDir)) {
        await fsPromises.mkdir(dataDir, { recursive: true });
      }

      await fsPromises.writeFile(
        this.newsHistoryFile,
        JSON.stringify(newsItems, null, 2),
        'utf8'
      );
      console.log(`Saved ${newsItems.length} news items to file`);
    } catch (error) {
      console.error('Error saving to file:', error);
    }
  }

  /**
   * Load rate probabilities from database or file
   */
  async loadRateProbabilities() {
    if (this.isProduction && this.pool) {
      return await this.loadRateProbabilitiesFromPostgres();
    } else {
      return await this.loadRateProbabilitiesFromFile();
    }
  }

  /**
   * Load rate probabilities from PostgreSQL
   */
  async loadRateProbabilitiesFromPostgres() {
    try {
      const result = await this.pool.query(
        `SELECT * FROM interest_rate_probabilities
         ORDER BY central_bank ASC`
      );

      const probabilities = {};
      for (const row of result.rows) {
        probabilities[row.central_bank] = {
          centralBank: row.central_bank,
          currency: row.currency,
          currentRate: parseFloat(row.current_rate),
          nextMeeting: row.next_meeting,
          probabilities: {
            hike: parseFloat(row.prob_hike),
            hold: parseFloat(row.prob_hold),
            cut: parseFloat(row.prob_cut)
          },
          expectedChange: parseFloat(row.expected_change),
          nextExpectedMove: row.next_expected_move,
          timeline: row.timeline,
          weekAgoData: row.week_ago_data,
          dataSource: row.data_source,
          lastUpdated: row.last_updated,
          isAvailable: true
        };
      }

      console.log(`Loaded ${Object.keys(probabilities).length} rate probabilities from PostgreSQL`);
      return probabilities;
    } catch (error) {
      console.error('Error loading rate probabilities from PostgreSQL:', error);
      return {};
    }
  }

  /**
   * Load rate probabilities from JSON file (development mode, async)
   */
  async loadRateProbabilitiesFromFile() {
    try {
      if (fs.existsSync(this.rateProbabilitiesFile)) {
        const data = await fsPromises.readFile(this.rateProbabilitiesFile, 'utf8');
        const probabilities = JSON.parse(data);
        console.log(`Loaded ${Object.keys(probabilities).length} rate probabilities from file`);
        return probabilities;
      }
      return {};
    } catch (error) {
      console.error('Error loading rate probabilities from file:', error);
      return {};
    }
  }

  /**
   * Save rate probabilities to database or file
   */
  async saveRateProbabilities(probabilities) {
    if (this.isProduction && this.pool) {
      await this.saveRateProbabilitiesToPostgres(probabilities);
    } else {
      await this.saveRateProbabilitiesToFile(probabilities);
    }
  }

  /**
   * Save rate probabilities to PostgreSQL
   */
  async saveRateProbabilitiesToPostgres(probabilities) {
    try {
      for (const [bankCode, data] of Object.entries(probabilities)) {
        if (!data.isAvailable) continue;

        await this.pool.query(
          `INSERT INTO interest_rate_probabilities
           (central_bank, currency, current_rate, next_meeting, prob_hike, prob_hold, prob_cut,
            expected_change, next_expected_move, timeline, week_ago_data, data_source, last_updated)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (central_bank, next_meeting) DO UPDATE SET
           current_rate = EXCLUDED.current_rate,
           prob_hike = EXCLUDED.prob_hike,
           prob_hold = EXCLUDED.prob_hold,
           prob_cut = EXCLUDED.prob_cut,
           expected_change = EXCLUDED.expected_change,
           next_expected_move = EXCLUDED.next_expected_move,
           timeline = EXCLUDED.timeline,
           week_ago_data = EXCLUDED.week_ago_data,
           data_source = EXCLUDED.data_source,
           last_updated = EXCLUDED.last_updated`,
          [
            bankCode,
            data.currency,
            data.currentRate,
            data.nextMeeting,
            data.probabilities.hike,
            data.probabilities.hold,
            data.probabilities.cut,
            data.expectedChange,
            data.nextExpectedMove,
            JSON.stringify(data.timeline),
            JSON.stringify(data.weekAgoData),
            data.dataSource,
            data.lastUpdated
          ]
        );
      }

      console.log(`Saved ${Object.keys(probabilities).length} rate probabilities to PostgreSQL`);
    } catch (error) {
      console.error('Error saving rate probabilities to PostgreSQL:', error);
    }
  }

  /**
   * Save rate probabilities to JSON file (development mode, async)
   */
  async saveRateProbabilitiesToFile(probabilities) {
    try {
      const dataDir = path.join(__dirname, '..', 'data');
      if (!fs.existsSync(dataDir)) {
        await fsPromises.mkdir(dataDir, { recursive: true });
      }

      await fsPromises.writeFile(
        this.rateProbabilitiesFile,
        JSON.stringify(probabilities, null, 2),
        'utf8'
      );
      console.log(`Saved ${Object.keys(probabilities).length} rate probabilities to file`);
    } catch (error) {
      console.error('Error saving rate probabilities to file:', error);
    }
  }

  /**
   * Close database connection (production only)
   */
  async close() {
    if (this.pool) {
      await this.pool.end();
      console.log('Database connection closed');
    }
  }

  // ============================================================================
  // USER MANAGEMENT
  // ============================================================================

  /**
   * Create users table if it doesn't exist
   */
  async createUsersTable() {
    if (!this.isProduction || !this.pool) {
      return; // Skip in development mode
    }

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255),
        display_name VARCHAR(255),
        picture TEXT,
        google_id VARCHAR(255),
        auth_provider VARCHAR(50) DEFAULT 'local',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        trial_start_date TIMESTAMPTZ,
        trial_end_date TIMESTAMPTZ,
        subscription_status VARCHAR(50) DEFAULT 'trial',
        subscription_plan VARCHAR(50),
        subscription_start_date TIMESTAMPTZ,
        subscription_end_date TIMESTAMPTZ,
        plan VARCHAR(50) DEFAULT 'free',
        reset_token VARCHAR(255),
        reset_token_expires BIGINT,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
    `;

    try {
      await this.pool.query(createTableQuery);
      console.log('Users table created/verified successfully');
    } catch (error) {
      console.error('Error creating users table:', error);
      throw error;
    }
  }

  /**
   * Get all users
   */
  async getAllUsers() {
    if (this.isProduction && this.pool) {
      return await this.getAllUsersFromPostgres();
    } else {
      return await this.getAllUsersFromFile();
    }
  }

  async getAllUsersFromPostgres() {
    try {
      const result = await this.pool.query(
        `SELECT id, email, display_name, picture, google_id, auth_provider,
                created_at, trial_start_date, trial_end_date, subscription_status,
                subscription_plan, subscription_start_date, subscription_end_date, plan
         FROM users ORDER BY created_at DESC`
      );

      return result.rows.map(row => ({
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        picture: row.picture,
        googleId: row.google_id,
        authProvider: row.auth_provider,
        createdAt: row.created_at?.toISOString(),
        trialStartDate: row.trial_start_date?.toISOString(),
        trialEndDate: row.trial_end_date?.toISOString(),
        subscriptionStatus: row.subscription_status,
        subscriptionPlan: row.subscription_plan,
        subscriptionStartDate: row.subscription_start_date?.toISOString(),
        subscriptionEndDate: row.subscription_end_date?.toISOString(),
        plan: row.plan
      }));
    } catch (error) {
      console.error('Error getting users from PostgreSQL:', error);
      return [];
    }
  }

  async getAllUsersFromFile() {
    try {
      if (fs.existsSync(this.usersFile)) {
        const data = await fsPromises.readFile(this.usersFile, 'utf8');
        return JSON.parse(data);
      }
      return [];
    } catch (error) {
      console.error('Error reading users file:', error);
      return [];
    }
  }

  /**
   * Find user by email
   */
  async findUserByEmail(email) {
    if (this.isProduction && this.pool) {
      return await this.findUserByEmailFromPostgres(email);
    } else {
      return await this.findUserByEmailFromFile(email);
    }
  }

  async findUserByEmailFromPostgres(email) {
    try {
      const result = await this.pool.query(
        `SELECT * FROM users WHERE email = $1`,
        [email]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        email: row.email,
        password: row.password,
        displayName: row.display_name,
        picture: row.picture,
        googleId: row.google_id,
        authProvider: row.auth_provider,
        createdAt: row.created_at?.toISOString(),
        trialStartDate: row.trial_start_date?.toISOString(),
        trialEndDate: row.trial_end_date?.toISOString(),
        subscriptionStatus: row.subscription_status,
        subscriptionPlan: row.subscription_plan,
        subscriptionStartDate: row.subscription_start_date?.toISOString(),
        subscriptionEndDate: row.subscription_end_date?.toISOString(),
        plan: row.plan,
        resetToken: row.reset_token,
        resetTokenExpires: row.reset_token_expires
      };
    } catch (error) {
      console.error('Error finding user by email:', error);
      return null;
    }
  }

  async findUserByEmailFromFile(email) {
    try {
      const users = await this.getAllUsersFromFile();
      return users.find(u => u.email === email) || null;
    } catch (error) {
      console.error('Error finding user in file:', error);
      return null;
    }
  }

  /**
   * Create a new user
   */
  async createUser(userData) {
    if (this.isProduction && this.pool) {
      return await this.createUserInPostgres(userData);
    } else {
      return await this.createUserInFile(userData);
    }
  }

  async createUserInPostgres(userData) {
    try {
      const result = await this.pool.query(
        `INSERT INTO users (id, email, password, display_name, picture, google_id, auth_provider,
                           created_at, trial_start_date, trial_end_date, subscription_status, plan)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [
          userData.id,
          userData.email,
          userData.password || null,
          userData.displayName,
          userData.picture || null,
          userData.googleId || null,
          userData.authProvider || 'local',
          userData.createdAt,
          userData.trialStartDate,
          userData.trialEndDate,
          userData.subscriptionStatus || 'trial',
          userData.plan || 'free'
        ]
      );

      const row = result.rows[0];
      console.log(`[DB] Created user in PostgreSQL: ${userData.email}`);
      return {
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        picture: row.picture,
        googleId: row.google_id,
        authProvider: row.auth_provider,
        createdAt: row.created_at?.toISOString(),
        trialStartDate: row.trial_start_date?.toISOString(),
        trialEndDate: row.trial_end_date?.toISOString(),
        subscriptionStatus: row.subscription_status,
        plan: row.plan
      };
    } catch (error) {
      console.error('Error creating user in PostgreSQL:', error);
      throw error;
    }
  }

  async createUserInFile(userData) {
    try {
      const users = await this.getAllUsersFromFile();
      users.push(userData);
      await fsPromises.writeFile(this.usersFile, JSON.stringify(users, null, 2));
      console.log(`[DB] Created user in file: ${userData.email}`);
      return userData;
    } catch (error) {
      console.error('Error creating user in file:', error);
      throw error;
    }
  }

  /**
   * Update a user
   */
  async updateUser(email, updates) {
    if (this.isProduction && this.pool) {
      return await this.updateUserInPostgres(email, updates);
    } else {
      return await this.updateUserInFile(email, updates);
    }
  }

  async updateUserInPostgres(email, updates) {
    try {
      // Build dynamic update query
      const setClauses = [];
      const values = [];
      let paramIndex = 1;

      const fieldMap = {
        password: 'password',
        displayName: 'display_name',
        picture: 'picture',
        googleId: 'google_id',
        authProvider: 'auth_provider',
        trialStartDate: 'trial_start_date',
        trialEndDate: 'trial_end_date',
        subscriptionStatus: 'subscription_status',
        subscriptionPlan: 'subscription_plan',
        subscriptionStartDate: 'subscription_start_date',
        subscriptionEndDate: 'subscription_end_date',
        plan: 'plan',
        resetToken: 'reset_token',
        resetTokenExpires: 'reset_token_expires'
      };

      for (const [key, value] of Object.entries(updates)) {
        if (fieldMap[key]) {
          setClauses.push(`${fieldMap[key]} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
      }

      if (setClauses.length === 0) {
        return await this.findUserByEmail(email);
      }

      setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(email);

      const query = `UPDATE users SET ${setClauses.join(', ')} WHERE email = $${paramIndex} RETURNING *`;
      const result = await this.pool.query(query, values);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      console.log(`[DB] Updated user in PostgreSQL: ${email}`);
      return {
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        picture: row.picture,
        googleId: row.google_id,
        authProvider: row.auth_provider,
        createdAt: row.created_at?.toISOString(),
        trialStartDate: row.trial_start_date?.toISOString(),
        trialEndDate: row.trial_end_date?.toISOString(),
        subscriptionStatus: row.subscription_status,
        subscriptionPlan: row.subscription_plan,
        subscriptionStartDate: row.subscription_start_date?.toISOString(),
        subscriptionEndDate: row.subscription_end_date?.toISOString(),
        plan: row.plan
      };
    } catch (error) {
      console.error('Error updating user in PostgreSQL:', error);
      return null;
    }
  }

  async updateUserInFile(email, updates) {
    try {
      const users = await this.getAllUsersFromFile();
      const userIndex = users.findIndex(u => u.email === email);

      if (userIndex === -1) {
        return null;
      }

      users[userIndex] = { ...users[userIndex], ...updates };
      await fsPromises.writeFile(this.usersFile, JSON.stringify(users, null, 2));
      console.log(`[DB] Updated user in file: ${email}`);
      return users[userIndex];
    } catch (error) {
      console.error('Error updating user in file:', error);
      return null;
    }
  }

  /**
   * Find user by reset token
   */
  async findUserByResetToken(token) {
    if (this.isProduction && this.pool) {
      try {
        const result = await this.pool.query(
          `SELECT * FROM users WHERE reset_token = $1 AND reset_token_expires > $2`,
          [token, Date.now()]
        );

        if (result.rows.length === 0) {
          return null;
        }

        const row = result.rows[0];
        return {
          id: row.id,
          email: row.email,
          password: row.password,
          displayName: row.display_name,
          resetToken: row.reset_token,
          resetTokenExpires: row.reset_token_expires
        };
      } catch (error) {
        console.error('Error finding user by reset token:', error);
        return null;
      }
    } else {
      const users = await this.getAllUsersFromFile();
      return users.find(u => u.resetToken === token && u.resetTokenExpires > Date.now()) || null;
    }
  }

  /**
   * Migrate users from file to PostgreSQL
   */
  async migrateUsersToPostgres() {
    if (!this.isProduction || !this.pool) {
      console.log('Not in production or no pool - skipping user migration');
      return;
    }

    try {
      // Check if we have users in the file
      if (!fs.existsSync(this.usersFile)) {
        console.log('No users.json file to migrate');
        return;
      }

      const fileUsers = await this.getAllUsersFromFile();
      if (fileUsers.length === 0) {
        console.log('No users to migrate from file');
        return;
      }

      let migrated = 0;
      for (const user of fileUsers) {
        // Check if user already exists in DB
        const existing = await this.findUserByEmailFromPostgres(user.email);
        if (!existing) {
          await this.createUserInPostgres({
            id: user.id || Date.now().toString(),
            email: user.email,
            password: user.password,
            displayName: user.displayName,
            picture: user.picture,
            googleId: user.googleId,
            authProvider: user.authProvider || 'local',
            createdAt: user.createdAt || new Date().toISOString(),
            trialStartDate: user.trialStartDate,
            trialEndDate: user.trialEndDate,
            subscriptionStatus: user.subscriptionStatus || 'trial',
            plan: user.plan || 'free'
          });
          migrated++;
        }
      }

      console.log(`[DB] Migrated ${migrated} users from file to PostgreSQL`);
    } catch (error) {
      console.error('Error migrating users to PostgreSQL:', error);
    }
  }
}

module.exports = new Database();
