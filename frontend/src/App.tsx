// src/App.tsx
import React, { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'

type SchemaField = {
  id: string
  label: string
  default: string
}

type UploadResponse = { schema: SchemaField[] }

type GeneratePayload = {
  template: string
  values: Record<string, string>
}

type ApiError = {
  error: string
  details?: string
  troubleshooting?: string[]
  technical?: {
    name: string
    code: string
  }
}

function App() {
  const [step, setStep] = useState<'upload' | 'fill' | 'done'>('upload')
  const [template, setTemplate] = useState<string>('')
  const [schema, setSchema] = useState<SchemaField[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking')
  const [troubleshooting, setTroubleshooting] = useState<string[]>([])

  const { register, handleSubmit, reset } = useForm<Record<string, string>>()

  // Check backend connectivity on mount
  useEffect(() => {
    checkBackendHealth()
  }, [])

  const checkBackendHealth = async () => {
    try {
      const response = await fetch('http://localhost:3001/health', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      })
      
      if (response.ok) {
        setBackendStatus('online')
      } else {
        setBackendStatus('offline')
      }
    } catch (error) {
      setBackendStatus('offline')
    }
  }

  const testGeminiConnection = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch('http://localhost:3001/test-gemini')
      const data = await response.json()
      
      if (data.success) {
        alert('✅ Gemini API connection successful!')
      } else {
        setError(`Gemini API test failed: ${data.error}`)
        setTroubleshooting(data.troubleshooting || [])
      }
    } catch (err: any) {
      setError(`Connection test failed: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  // 1) Send raw LaTeX to /upload-tex
  const onUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setTroubleshooting([])
    setLoading(true)
    
    try {
      const resp = await fetch('http://localhost:3001/upload-tex', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: template,
      })
      
      if (!resp.ok) {
        const errorData = await resp.json() as ApiError
        setTroubleshooting(errorData.troubleshooting || [])
        throw new Error(errorData.error || resp.statusText)
      }
      
      const data = (await resp.json()) as UploadResponse
      setSchema(data.schema)
      
      // initialize the form with defaults:
      const defaults: Record<string,string> = {}
      data.schema.forEach(f => { defaults[f.id] = f.default })
      reset(defaults)
      setStep('fill')
    } catch (err: any) {
      console.error('Upload error:', err)
      setError(`Failed to parse template: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  // 2) Send filled values + template to /generate-pdf and trigger download
  const onGenerate = async (values: Record<string, string>) => {
    setError(null)
    setTroubleshooting([])
    setLoading(true)
    
    try {
      const payload: GeneratePayload = { template, values }
      const resp = await fetch('http://localhost:3001/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      
      if (!resp.ok) {
        const errorData = await resp.json() as ApiError
        setTroubleshooting(errorData.troubleshooting || [])
        throw new Error(errorData.error || resp.statusText)
      }
      
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'resume.pdf'
      a.click()
      URL.revokeObjectURL(url)
      setStep('done')
    } catch (err: any) {
      console.error('Generation error:', err)
      setError(`Failed to generate PDF: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const resetApp = () => {
    setStep('upload')
    setTemplate('')
    setSchema([])
    setError(null)
    setTroubleshooting([])
    reset()
  }

  const StatusIndicator = () => (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      gap: '8px',
      marginBottom: '1rem',
      padding: '8px 12px',
      backgroundColor: backendStatus === 'online' ? '#d4edda' : '#f8d7da',
      border: `1px solid ${backendStatus === 'online' ? '#c3e6cb' : '#f5c6cb'}`,
      borderRadius: '4px',
      fontSize: '14px'
    }}>
      <span style={{ 
        width: '8px', 
        height: '8px', 
        borderRadius: '50%', 
        backgroundColor: backendStatus === 'online' ? '#28a745' : '#dc3545'
      }} />
      <span>
        Backend: {backendStatus === 'checking' ? 'Checking...' : backendStatus}
      </span>
      {backendStatus === 'online' && (
        <button 
          onClick={testGeminiConnection}
          disabled={loading}
          style={{ 
            marginLeft: 'auto',
            padding: '4px 8px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '3px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '12px'
          }}
        >
          {loading ? 'Testing...' : 'Test Gemini'}
        </button>
      )}
    </div>
  )

  return (
    <div style={{ maxWidth: 600, margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <h1>LaTeX Resume Builder MVP</h1>
      <p style={{ color: '#666', marginBottom: '1rem' }}>
        Powered by Gemini AI - Upload your LaTeX template and generate a personalized resume
      </p>
      
      <StatusIndicator />
      
      {step === 'upload' && (
        <div>
          <label>
            Paste your LaTeX template:
            <textarea
              value={template}
              onChange={e => setTemplate(e.target.value)}
              rows={12}
              style={{ 
                width: '100%', 
                fontFamily: 'monospace',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                marginTop: '8px'
              }}
              placeholder="Paste your .tex file content here..."
              disabled={loading || backendStatus !== 'online'}
            />
          </label>
          <button 
            onClick={onUpload}
            style={{ 
              marginTop: 16,
              padding: '10px 20px',
              backgroundColor: loading || backendStatus !== 'online' ? '#ccc' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading || backendStatus !== 'online' ? 'not-allowed' : 'pointer'
            }}
            disabled={loading || !template.trim() || backendStatus !== 'online'}
          >
            {loading ? 'Parsing Template...' : 'Parse Template'}
          </button>
        </div>
      )}

      {step === 'fill' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2>Fill in your details</h2>
            <button 
              onClick={resetApp}
              style={{ 
                padding: '5px 10px',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              Start Over
            </button>
          </div>
          
          {schema.map(field => (
            <div key={field.id} style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px' }}>
                {field.label}
              </label>
              <input
                {...register(field.id)}
                defaultValue={field.default}
                style={{ 
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
                disabled={loading}
              />
            </div>
          ))}
          
          <button 
            onClick={handleSubmit(onGenerate)}
            style={{ 
              padding: '10px 20px',
              backgroundColor: loading ? '#ccc' : '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
            disabled={loading}
          >
            {loading ? 'Generating PDF...' : 'Generate PDF'}
          </button>
        </div>
      )}

      {step === 'done' && (
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <p style={{ fontSize: '18px', color: '#28a745' }}>Your PDF is downloading! 🎉</p>
          <p style={{ color: '#666', marginBottom: '1rem' }}>
            Check your downloads folder for the generated resume.
          </p>
          <button 
            onClick={resetApp}
            style={{ 
              padding: '10px 20px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Create Another Resume
          </button>
        </div>
      )}

      {error && (
        <div style={{ 
          padding: '12px',
          backgroundColor: '#f8d7da',
          color: '#721c24',
          border: '1px solid #f5c6cb',
          borderRadius: '4px',
          marginTop: '1rem'
        }}>
          <strong>Error:</strong> {error}
          
          {troubleshooting.length > 0 && (
            <div style={{ marginTop: '8px' }}>
              <strong>Troubleshooting:</strong>
              <ul style={{ margin: '4px 0', paddingLeft: '20px' }}>
                {troubleshooting.map((tip, index) => (
                  <li key={index}>{tip}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {backendStatus === 'offline' && (
        <div style={{ 
          padding: '12px',
          backgroundColor: '#f8d7da',
          color: '#721c24',
          border: '1px solid #f5c6cb',
          borderRadius: '4px',
          marginTop: '1rem'
        }}>
          <strong>Backend Offline:</strong> Make sure your backend server is running on port 3001
          <br />
          <small>Run: <code>cd backend && node server.js</code></small>
        </div>
      )}
    </div>
  )
}

export default App