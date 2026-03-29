# Dwellera - Premium Real Estate Marketplace

Dwellera is a fully-featured, modern, and high-performance real estate marketplace built to seamlessly connect buyers and sellers. Featuring a highly interactive geographical map interface, real-time messaging, and a sleek modern UI design, Dwellera brings a premium, single-page application experience to property hunting.

## ✨ Core Features

* **Interactive Map Search**: Built on Leaflet, users can freely pan the globe and search any address using intelligent geocoding to discover local properties.
* **Dual-Pane Real-Time Chat**: Engage in seamless conversations directly with property sellers. Powered by Supabase Broadcast technology, messages sync across clients within milliseconds via WebSockets without needing page reloads.
* **Global Notifications**: Dynamic, cross-platform toast popups alert you when buyers inquire about your listing or sellers respond to your questions, no matter what page you are browsing.
* **Seller Dashboard**: A centralized hub for property owners to list, manage, edit, and instantly toggle the availability status (Available / SOLD) of their active real estate.
* **Responsive Layouts**: Meticulously designed mobile-first architecture utilizing Tailwind CSS means the interface looks incredible and native whether you are on an iPhone or an Ultrawide Desktop monitor.
* **Cloudinary Media Hosting**: Robust integration with Cloudinary allows rapid drag-and-drop property image uploading and optimization.

## 🛠️ Technology Stack

### Frontend
* **Framework**: React 18, Next.js (App Router), TypeScript
* **Styling**: Tailwind CSS
* **Map Engine**: React-Leaflet (`leaflet`) with CartoDB Base Maps
* **Real-time Engine**: `@supabase/supabase-js`

### Backend
* **API Framework**: FastAPI (Python)
* **Database Mapping**: SQLAlchemy
* **Database Hosting**: PostgreSQL via Supabase
* **Image Delivery**: Cloudinary API 
* **Server Deployment**: Uvicorn

## 🚀 Running the Project Locally

### Prerequisites
* **Node.js**: v18 or newer
* **Python**: v3.10 or newer

### 1. Database Setup
1. Create a [Supabase](https://supabase.com/) project.
2. In the resulting dashboard, record your PostgreSQL connection string, Supabase URL, and Anon Key.
3. Obtain a [Cloudinary](https://cloudinary.com/) API environment variable.

### 2. Backend Initialization
```bash
cd backend

# Create a Python Virtual Environment
python -m venv venv
venv\Scripts\activate

# Install Dependencies
pip install -r requirements.txt

# Create your Environment Configuration
# Copy .env.example to .env and insert your actual API keys
cp .env.example .env

# Start the FastAPI Server on http://localhost:8000
uvicorn main:app --reload
```

### 3. Frontend Initialization
```bash
cd frontend

# Install Dependencies
npm install

# Create your Environment Configuration
# Copy .env.local.example to .env.local and insert your actual API keys
cp .env.local.example .env.local

# Start the Next.js Development Server on http://localhost:3000
npm run dev
```

### 4. Viewing
Open your browser and navigate to `http://localhost:3000`. You can begin by creating an account and logging in.

## ☁️ Deployment (AWS)

### Backend (AWS App Runner)
1. Connect your GitHub repository to **AWS App Runner**.
2. Set the runtime to `Python 3` or use the `Dockerfile` provided in the `/backend` folder.
3. Configure Environment Variables: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_KEY`.
4. Set the port to `8000`.

### Frontend (AWS Amplify)
1. Connect your GitHub repository to **AWS Amplify**.
2. Choose the `/frontend` directory as the app root.
3. Amplify will automatically detect Next.js settings.
4. Configure Environment Variables: `NEXT_PUBLIC_API_URL` (point to your App Runner URL), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, etc.

---
*Built as a showcase for modern web UI architecture.*
