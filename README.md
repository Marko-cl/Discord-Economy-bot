# Discord-Economy-bot
Project
# Kelonomy Discord Bot (discord.js)

A feature-rich Discord economy bot built with [discord.js](https://discord.js.org/), featuring:
- Coins, shop, inventory, leaderboard
- MongoDB integration
- Modern slash commands only (no prefix commands)
- Games, social, and economy features

## Setup

1. **Install Node.js** (v18+ recommended)
2. **Clone this repo** and `cd` into the folder
3. **Install dependencies:**
   ```bash
   npm install
   ```
4. **Set up your environment variables:**
   - Create a `.env` file with:
     ```env
     DISCORD_TOKEN=your-bot-token-here
     MONGODB_URI=your-mongodb-uri-here
     CLIENT_ID=your-bot-client-id
     GUILD_ID=your-test-server-id (for fast slash command registration)
     ```
5. **Run the bot:**
   ```bash
   node index.js
   ```

## Features
- Economy: balance, daily, beg, work, leaderboard, inventory, profile
- Shop: view shop, buy items
- Games: quiz, slots, duel, heist, bet, party, quest
- Social: trade, gift, rob
- All commands are slash commands

## Project Structure
- `index.js` — Main bot entry point
- `cogs/` — Feature modules (economy, shop, games, social)
- `db.js` — MongoDB connection helper

## Extending the Bot

### Adding New Shop Items
- Add a new item to your MongoDB ShopItem collection with the desired name, price, description, category, and effect.
- Update the item logic in `use.js` if it has a new effect type.
- Update `constants.js` if you want to hide or categorize the item.

### Adding New Commands
- Create a new file in the `cogs/` directory following the structure of existing commands.
- Export a `data` (SlashCommandBuilder) and `execute` function.
- The bot will auto-load all commands in `cogs/` on startup.

### General Tips
- Use the utility functions in `utils.js` for inventory and DB updates.
- Add new categories or removed items to `constants.js` for easy management.
- Use the logger (`logger.js`) for all info, warning, and error messages.
- Keep code modular and well-commented for future maintainability.

## Security Best Practices
- **Never commit your .env file or secrets to version control.**
- **Always use environment variables for tokens, database URIs, and webhooks.**
- **Use the minimum Discord permissions required for your bot.**
- **Regularly update dependencies and run `npm audit`.**
- **Validate and sanitize all user input.**
- **Restrict your MongoDB user and IP whitelist.**
- **Never pass user input to dangerous Node.js APIs (eval, exec, fs, etc.).**
- **Log and audit all admin actions.**
- **Back up your database regularly.**

## Security Checklist for Contributors

- **Input Validation:**
  - Always validate and sanitize all user input (IDs, numbers, strings) using the provided utilities in `utils.js`:
    - `isSafeDiscordId`, `validateNumber`, `validateString`, `sanitizeString`
  - Add a comment block marking the validation section in every new command.
- **Rate Limiting:**
  - Global rate limiting is enforced (10 commands per 10 seconds per user). Do not remove or bypass this logic.
- **Permission Checks:**
  - Always check for owner/admin permissions on sensitive commands.
- **Sensitive Data:**
  - Never log or expose secrets, tokens, or sensitive user data.
- **Dependency Safety:**
  - Run `npm audit` regularly and keep dependencies up to date.
- **Logging:**
  - Use the provided logger for all info, warning, and error messages.
- **Code Reviews:**
  - All new features and commands should be reviewed for security and validation before merging.

## Running Tests

This project uses [Jest](https://jestjs.io/) for unit and integration testing.

To run all tests:

```
npm install
npm test
```

## Monitoring & Alerting

Critical errors are sent to a Discord webhook if `DISCORD_ALERT_WEBHOOK` is set in your environment variables. For advanced monitoring, you can integrate with [Sentry](https://sentry.io/) or similar services.

## Contributing Robust Code

- Always wrap async/await code in try/catch and log errors.
- Validate all user input and check for edge cases.
- Use rate limiting and blacklist checks in all user-facing commands.
- Never log sensitive data; use the provided logger for redaction.
- Add or update tests for new features or bugfixes.

---

**This is a full rewrite from Python/nextcord to JavaScript/discord.js.**

## Minimal Discord Permissions

- Only grant the bot the permissions it needs. Do NOT use `ADMINISTRATOR`, `MANAGE_ROLES`, or similar unless absolutely required.
- Recommended permissions: `Send Messages`, `Read Messages`, `Use Slash Commands`, `Embed Links`, `Attach Files`.
- **Sample bot invite link (replace CLIENT_ID):**
  ```
  https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&scope=bot+applications.commands&permissions=277025508352
  ```
  (This grants only basic permissions for slash commands and embeds.)

## Dependency Safety

- Run `npm audit` regularly to check for vulnerabilities:
  ```bash
  npm audit
  ```
- Update dependencies as needed:
  ```bash
  npm update
  ```
- Only use well-maintained, safe libraries. Avoid deprecated or untrusted packages.

## Security Policy Reminders

- All commands must use input validation and sanitization utilities from `utils.js`.
- All sensitive actions (economy, inventory, admin) must be logged using `logger.js`.
- All database actions should be wrapped in try/catch or use `.catch()` to prevent crashes.
- Never log or expose secrets, tokens, or sensitive user data.
- All commands must be slash commands; do not use message-based commands.
- Admin/owner commands must always check permissions.
- Do not bypass or remove cooldowns or rate-limiting logic.

--- 
