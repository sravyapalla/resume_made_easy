# LaTeX Resume Builder MVP

A full-stack web application that allows users to upload LaTeX resume templates, extract fillable fields using AI, and generate personalized PDF resumes.

## Features

- 🤖 **AI-Powered Field Extraction**: Uses Google Gemini AI to automatically detect fillable fields in LaTeX templates
- 📝 **Dynamic Form Generation**: Creates forms based on extracted template variables
- 📄 **PDF Generation**: Compiles LaTeX to PDF using online LaTeX compilers
- 💻 **Modern UI**: Clean React frontend with TypeScript and Tailwind CSS
- 🔧 **Real-time Validation**: Template validation and error handling
- 🌐 **Backend API**: Node.js/Express server with comprehensive error handling

## Tech Stack

### Frontend
- React 18 with TypeScript
- Vite for build tooling
- Tailwind CSS for styling
- React Hook Form for form management

### Backend
- Node.js with Express
- Google Gemini AI API
- LaTeX compilation via online services
- File upload handling

## Prerequisites

- Node.js (v18+ recommended)
- Google Gemini AI API key
- Git

## Setup Instructions

### 1. Clone the Repository
```bash
git clone <your-repo-url>
cd resume-builder-mvp
```

### 2. Backend Setup
```bash
cd backend
npm install
```

Create a `.env` file in the backend directory:
```env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3001
```

Start the backend server:
```bash
npm start
```

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

The application will be available at `http://localhost:5173/`

## Usage

1. **Upload Template**: Paste your LaTeX resume template in the text area
2. **Parse Template**: Click "Parse Template" to extract fillable fields using AI
3. **Fill Details**: Complete the generated form with your information
4. **Generate PDF**: Click "Generate PDF" to create your personalized resume
5. **Download**: Your resume will automatically download as a PDF

## Project Structure

```
resume-builder-mvp/
├── frontend/                 # React frontend application
│   ├── src/
│   │   ├── App.tsx          # Main application component
│   │   ├── index.css        # Global styles
│   │   └── main.tsx         # Application entry point
│   ├── package.json
│   └── vite.config.ts
├── backend/                  # Node.js backend API
│   ├── server.js            # Express server
│   ├── latex_compiler.py    # LaTeX compilation utilities
│   ├── latex_online.py      # Online LaTeX service integration
│   ├── test-gemini.js       # Gemini API testing
│   └── package.json
├── .gitignore
└── README.md
```

## API Endpoints

- `GET /health` - Backend health check
- `GET /test-gemini` - Test Gemini AI connection
- `POST /upload-tex` - Upload and parse LaTeX template
- `POST /generate-pdf` - Generate PDF from template and data

## Environment Variables

### Backend (.env)
```env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3001
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Troubleshooting

### Common Issues

1. **Backend Offline**: Ensure the backend server is running on port 3001
2. **Gemini API Errors**: Verify your API key is correct and has proper permissions
3. **LaTeX Compilation Errors**: Check that your template syntax is valid
4. **CORS Issues**: Make sure both frontend and backend are running on correct ports

### Support

If you encounter any issues, please check the troubleshooting section or create an issue in the repository.

## Acknowledgments

- Google Gemini AI for intelligent field extraction
- LaTeX community for template standards
- React and Node.js communities for excellent documentation
