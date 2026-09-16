'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Invite code / signup state
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [showInviteInput, setShowInviteInput] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [isValidatingCode, setIsValidatingCode] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [isInviteValidated, setIsInviteValidated] = useState(false);

  const handleValidateInvite = async () => {
    setIsValidatingCode(true);
    setInviteError(null);
    try {
      const response = await fetch('/api/validate-invite-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Invalid invite code');
      }

      setIsInviteValidated(true);
      setIsSigningUp(true);
      setShowInviteInput(false);
    } catch (err: any) {
      setInviteError(err.message || 'An unexpected error occurred');
    } finally {
      setIsValidatingCode(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage('');

    try {
      if (isSigningUp) {
        const response = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, inviteCode }),
        });
        if (!response.ok) {
          const data = await response.json();
          setErrorMessage(data.error || 'Failed to create account.');
          return;
        }

        toast({ title: 'Account created', description: 'You can now log in.' });
        setIsSigningUp(false);
        setIsInviteValidated(false);
      } else {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        if (!response.ok) {
          const data = await response.json();
          setErrorMessage(data.error || 'Failed to sign in.');
          return;
        }

        window.location.href = '/app';
      }
    } catch (err) {
      console.error(err);
      setErrorMessage('An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-xl border p-8">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-0 mb-1">
            <span className="font-black text-3xl tracking-tight text-gray-900">lead</span>
            <span className="font-black text-3xl tracking-tight text-white bg-indigo-600 px-2 py-0.5 rounded-lg ml-0.5">gtm</span>
          </div>
          <p className="text-gray-500 mt-1 text-sm uppercase tracking-wider">
            {isSigningUp ? 'Create your account' : 'Sign in to your account'}
          </p>
        </div>

        {isInviteValidated && isSigningUp && (
          <div className="mb-4 rounded-lg bg-green-50 border border-green-200 p-3 text-center">
            <p className="text-sm text-green-800">
              Invite code accepted! Create your account below.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">
              {isSigningUp ? 'Create Password' : 'Password'}
            </Label>
            <Input
              id="password"
              type="password"
              placeholder={isSigningUp ? 'Min 6 characters' : 'Enter your password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isSubmitting}
              minLength={6}
            />
          </div>

          {errorMessage && (
            <div className="text-red-600 text-sm bg-red-50 p-3 rounded-md border border-red-200">
              {errorMessage}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting
              ? (isSigningUp ? 'Creating account...' : 'Signing in...')
              : (isSigningUp ? 'Create Account' : 'Sign In')
            }
          </Button>

        </form>

        <div className="mt-6 flex flex-col items-center space-y-3">
          {!showInviteInput && !isSigningUp && (
            <button
              type="button"
              onClick={() => setShowInviteInput(true)}
              className="text-sm text-gray-400 hover:text-gray-600 underline"
            >
              Have an invite code?
            </button>
          )}

          {showInviteInput && !isInviteValidated && (
            <div className="w-full space-y-3">
              {inviteError && (
                <div className="text-xs text-center p-2 rounded bg-red-50 text-red-700">
                  {inviteError}
                </div>
              )}
              <Input
                type="text"
                placeholder="Enter invite code"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                disabled={isValidatingCode}
                maxLength={20}
                className="text-center"
              />
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleValidateInvite}
                disabled={isValidatingCode || !inviteCode}
              >
                {isValidatingCode ? 'Validating...' : 'Submit Code'}
              </Button>
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setShowInviteInput(false);
                    setInviteError(null);
                    setInviteCode('');
                  }}
                  className="text-sm text-gray-400 hover:text-gray-600 underline"
                >
                  Back
                </button>
              </div>
            </div>
          )}

          {isSigningUp && (
            <button
              type="button"
              onClick={() => {
                setIsSigningUp(false);
                setIsInviteValidated(false);
                setErrorMessage('');
              }}
              className="text-sm text-gray-400 hover:text-gray-600 underline"
            >
              Already have an account? Sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
