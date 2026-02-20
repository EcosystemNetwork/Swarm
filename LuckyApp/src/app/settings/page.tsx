'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTeam } from '@/contexts/TeamContext';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';

export default function SettingsPage() {
  const { currentTeam } = useTeam();
  const { primaryWallet } = useDynamicContext();
  const [name, setName] = useState(currentTeam?.name || '');
  const [description, setDescription] = useState(currentTeam?.description || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTeam) return;
    setSaving(true);
    setMessage(null);

    try {
      // TODO: persist to backend when available
      setMessage({ type: 'success', text: 'Team settings updated!' });
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update team',
      });
    } finally {
      setSaving(false);
    }
  };

  if (!currentTeam) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <p className="text-gray-500">No team selected</p>
      </div>
    );
  }

  return (
    <main className="min-h-[calc(100vh-4rem)] p-6 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Team Settings</h1>
          <p className="text-gray-500">Manage your team profile</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Update your team information</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-5">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center">
                  <span className="text-2xl">🍀</span>
                </div>
                <div className="text-sm text-gray-500">
                  <p className="font-medium text-gray-900">{currentTeam.name}</p>
                  <p className="font-mono text-xs">{currentTeam.id}</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Team Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="What does your team do?"
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                />
              </div>

              {message && (
                <div className={`text-sm rounded-md p-3 ${
                  message.type === 'success'
                    ? 'bg-green-50 text-green-600 border border-green-200'
                    : 'bg-red-50 text-red-600 border border-red-200'
                }`}>
                  {message.text}
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={saving || !name.trim()}
                  className="bg-green-500 hover:bg-green-600 text-white"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Operators */}
        <Card>
          <CardHeader>
            <CardTitle>Operators</CardTitle>
            <CardDescription>Team members and their roles</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-md bg-gray-50 border border-gray-200">
                <div>
                  <p className="text-sm font-medium">
                    {primaryWallet?.address
                      ? `${primaryWallet.address.slice(0, 6)}...${primaryWallet.address.slice(-4)}`
                      : 'You'}
                  </p>
                  <p className="text-xs text-gray-500">Owner</p>
                </div>
                <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                  Admin
                </span>
              </div>
            </div>
            <Button variant="outline" size="sm" className="mt-4" disabled>
              + Invite Operator (coming soon)
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
