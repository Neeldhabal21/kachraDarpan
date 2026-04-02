# KachraDarpan – AI Smart Waste Management

KachraDarpan is a waste management system that uses AI to analyze garbage and report it to the relevant authorities.

## 🚀 Deployment Instructions (Render)

1. **Push to GitHub**: Initialize a Git repository and push this code to a new GitHub repository.
2. **Connect to Render**: Log in to [Render](https://render.com), create a new **Web Service**, and connect your GitHub repository.
3. **Configuration**:
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. **Environment Variables**: Add any necessary environment variables if needed.
5. **Update Base URL**: After deployment, Render will provide you with a URL (e.g., `https://kachradarpan.onrender.com`). You **must** update the `BASE_URL` variable at the top of the script tags in the following files to match your live URL:
   - `index.html`
   - `login.html`
   - `register.html`
   - `dashboard.html`

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the server:
   ```bash
   npm start
   ```
3. Open `http://localhost:4000` in your browser.

## Features

- **AI Analysis**: Uses MobileNet for material classification.
- **Reporting System**: Real-time waste reporting with image evidence.
- **Officer Dashboard**: Centralized management for cleanup authorities.
- **Role-based Access**: Mayor, Zonal Officer, and Gram Panchayat roles.
