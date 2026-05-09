"use client";

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('buyer'); // only used for signup
  const [loading, setLoading] = useState(false);
  const [verifyingId, setVerifyingId] = useState(false);
  const [verificationToken, setVerificationToken] = useState('');
  const [verificationStatus, setVerificationStatus] = useState('');
  const [idFile, setIdFile] = useState<File | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
  const [error, setError] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const router = useRouter();

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.push('/dashboard');
      }
    };
    checkUser();
  }, [router]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const attachStreamToVideo = async () => {
      if (!cameraActive || !videoRef.current || !streamRef.current) return;
      videoRef.current.srcObject = streamRef.current;
      try {
        await videoRef.current.play();
      } catch {
        // Browsers may delay autoplay until a user interaction.
      }
    };

    attachStreamToVideo();
  }, [cameraActive]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setCameraReady(false);
  };

  const startCamera = async () => {
    setError('');
    setCapturedPreview(null);
    setIdFile(null);
    setVerificationStatus('');
    setVerificationToken('');
    setCameraReady(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });
      streamRef.current = stream;
      setCameraActive(true);
    } catch {
      setError('Unable to access camera. Please allow camera permission and try again.');
    }
  };

  const capturePhoto = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      setError('Camera is not ready yet. Please wait a moment and try again.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      setError('Unable to capture image from camera.');
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 1));
    if (!blob) {
      setError('Unable to create image file from camera capture.');
      return;
    }

    setIdFile(new File([blob], 'government-id.jpg', { type: 'image/jpeg' }));
    setCapturedPreview(canvas.toDataURL('image/jpeg', 0.8));
    setVerificationStatus('');
    setVerificationToken('');
    stopCamera();
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else router.push('/dashboard');
    } else {
      if (!name.trim()) {
        setError("Full Name is required for signup.");
        setLoading(false);
        return;
      }
      if (role === 'seller' && (!verificationToken || verificationStatus !== 'verified')) {
        setError("Please complete government ID verification before signup.");
        setLoading(false);
        return;
      }
      const { data, error } = await supabase.auth.signUp({
        email, 
        password,
        options: {
          data: { role, full_name: name }
        }
      });
      if (error) setError(error.message);
      else {
        // Automatically sync new Supabase user to custom backend users table
        if (data.user) {
          try {
            await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/users`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: data.user.id, email, name, role, verification_token: verificationToken })
            });
          } catch(e) {
            console.error("Failed to sync user to database", e);
          }
        }
        setError('Signup successful! You can now log in.');
        setIsLogin(true);
      }
    }
    setLoading(false);
  };

  const verifyGovernmentId = async () => {
    if (!idFile) {
      setError("Please capture your government ID image.");
      return;
    }
    if (!name.trim() || !email.trim()) {
      setError("Enter name and email before ID verification.");
      return;
    }
    setVerifyingId(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append("full_name", name);
      formData.append("email", email);
      formData.append("file", idFile);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/id-verification/verify`, {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.detail || "Verification failed");
      }
      setVerificationToken(data.verification_token);
      setVerificationStatus(data.verification_status);
      if (data.verification_status !== 'verified') {
        setError("ID captured but auto verification is pending review. Use a clearer photo.");
      }
    } catch (e: any) {
      setError(e.message || "ID verification failed.");
    } finally {
      setVerifyingId(false);
    }
  };

  const handleRoleChange = (nextRole: string) => {
    setRole(nextRole);
    if (nextRole !== 'seller') {
      stopCamera();
      setIdFile(null);
      setCapturedPreview(null);
      setVerificationStatus('');
      setVerificationToken('');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-80px)] bg-gray-50">
      <div className="w-full max-w-md p-8 space-y-6 bg-white border rounded-xl shadow-sm">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            {isLogin ? 'Sign in to Dwellera' : 'Create an Account'}
          </h1>
          <p className="text-sm text-gray-500 mt-2">
            {isLogin ? 'Enter your credentials to access the marketplace' : 'Join to buy or sell properties'}
          </p>
        </div>

        {error && (
          <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md border border-red-100">
            {error}
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="email" className="text-sm font-medium text-gray-700">Email</label>
            <input 
              id="email"
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" 
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="text-sm font-medium text-gray-700">Password</label>
            <input 
              id="password"
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" 
              placeholder="••••••••"
            />
          </div>

          {!isLogin && (
            <>
              <div className="space-y-1">
                <label htmlFor="name" className="text-sm font-medium text-gray-700">Full Name</label>
                <input 
                  id="name"
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" 
                  placeholder="John Doe"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">I want to...</label>
                <select 
                  value={role} 
                  onChange={(e) => handleRoleChange(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="buyer">Buy Properties</option>
                  <option value="seller">Sell Properties</option>
                </select>
              </div>

              {role === 'seller' && (
                <div className="space-y-2 border rounded-md p-3 bg-gray-50">
                  <label className="text-sm font-medium text-gray-700">Government ID Verification (Camera Required)</label>
                  {!cameraActive && !capturedPreview && (
                    <button
                      type="button"
                      onClick={startCamera}
                      className="w-full py-2 px-3 text-sm text-white bg-gray-800 rounded-md"
                    >
                      Open Camera
                    </button>
                  )}
                  {cameraActive && (
                    <div className="space-y-2">
                      <video
                        ref={videoRef}
                        onLoadedMetadata={() => setCameraReady(true)}
                        autoPlay
                        playsInline
                        muted
                        className="w-full rounded-md border bg-black"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={capturePhoto}
                          disabled={!cameraReady}
                          className="py-2 px-3 text-sm text-white bg-gray-800 rounded-md disabled:opacity-50"
                        >
                          {cameraReady ? 'Capture ID' : 'Preparing camera...'}
                        </button>
                        <button
                          type="button"
                          onClick={stopCamera}
                          className="py-2 px-3 text-sm text-gray-700 bg-white border rounded-md"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                  {capturedPreview && (
                    <div className="space-y-2">
                      <img src={capturedPreview} alt="Captured government ID" className="w-full rounded-md border" />
                      <button
                        type="button"
                        onClick={startCamera}
                        className="w-full py-2 px-3 text-sm text-gray-700 bg-white border rounded-md"
                      >
                        Retake Photo
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={verifyGovernmentId}
                    disabled={verifyingId || !idFile}
                    className="w-full py-2 px-3 text-sm text-white bg-gray-800 rounded-md disabled:opacity-50"
                  >
                    {verifyingId ? 'Verifying ID...' : 'Verify Government ID'}
                  </button>
                  {verificationStatus && (
                    <p className={`text-xs font-medium ${verificationStatus === 'verified' ? 'text-green-600' : 'text-amber-600'}`}>
                      Verification status: {verificationStatus}
                    </p>
                  )}
                  <p className="text-xs text-gray-500">
                    Seller accounts must verify via live camera capture. File upload is disabled.
                  </p>
                  <p className="text-xs text-gray-500">
                    For better detection: keep full ID in frame, avoid glare/blur, and use good lighting.
                  </p>
                </div>
              )}
            </>
          )}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-2.5 px-4 text-white bg-primary hover:bg-gray-800 rounded-md shadow focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary font-medium transition disabled:opacity-50"
          >
            {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Sign Up')}
          </button>
        </form>

        <div className="text-center text-sm">
          <span className="text-gray-500">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
          </span>
          <button 
            onClick={() => { setIsLogin(!isLogin); setError(''); }} 
            className="text-primary hover:underline font-medium"
          >
            {isLogin ? 'Sign Up' : 'Sign In'}
          </button>
        </div>
      </div>
    </div>
  );
}
