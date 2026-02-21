'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useOrg } from '@/contexts/OrgContext';
import { useActiveAccount } from 'thirdweb/react';
import { updateOrganization } from '@/lib/firestore';

export default function SettingsPage() {
  const { currentOrg, refreshOrgs } = useOrg();
  const account = useActiveAccount();
  const address = account?.address;
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Initialize form with current org data
  useEffect(() => {
    if (currentOrg) {
      setName(currentOrg.name);
      setDescription(currentOrg.description || '');
    }
  }, [currentOrg]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg) return;
    
    setSaving(true);
    setMessage(null);

    try {
      await updateOrganization(currentOrg.id, {
        name: name.trim(),
        description: description.trim() || undefined,
      });

      // Refresh org data to reflect changes
      await refreshOrgs();
      
      setMessage({ type: 'success', text: 'Organization settings updated successfully!' });
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update organization',
      });
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (timestamp: unknown) => {
    if (!timestamp) return 'Unknown';
    
    let date: Date;
    if (timestamp && typeof timestamp === 'object' && 'seconds' in timestamp) {
      date = new Date((timestamp as any).seconds * 1000);
    } else {
      date = new Date(timestamp as any);
    }
    
    return date.toLocaleDateString();
  };

  if (!currentOrg) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">⚙️ Settings</h1>
          <p className="text-gray-500 mt-1">No organization selected</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">⚙️ Settings</h1>
        <p className="text-gray-500 mt-1">Manage your organization settings</p>
      </div>

      <div className="max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Organization Profile</CardTitle>
            <CardDescription>Update your organization information</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-5">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl border border-amber-200 bg-amber-50 flex items-center justify-center">
                  <span className="text-2xl">⚡</span>
                </div>
                <div className="text-sm text-gray-500">
                  <p className="font-medium text-gray-900">{currentOrg.name}</p>
                  <p className="text-xs">Created {formatDate(currentOrg.createdAt)}</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Organization Name <span className="text-red-500">*</span>
                </label>
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Organization name"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Description</label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="What does your organization do?"
                />
              </div>

              {message && (
                <div className={`text-sm rounded-md p-3 ${
                  message.type === 'success'
                    ? 'bg-emerald-50 text-emerald-600 border border-green-200'
                    : 'bg-red-50 text-red-600 border border-red-200'
                }`}>
                  {message.text}
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={saving || !name.trim() || name === currentOrg.name && description === (currentOrg.description || '')}
                  className="bg-amber-600 hover:bg-blue-700 text-white"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
            <CardDescription>Organization members and their roles</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {/* Owner */}
              <div className="flex items-center justify-between p-3 rounded-md bg-amber-50 border border-amber-200">
                <div>
                  <p className="text-sm font-medium">
                    {currentOrg.ownerAddress.slice(0, 8)}...{currentOrg.ownerAddress.slice(-6)}
                  </p>
                  <p className="text-xs text-gray-500">Owner</p>
                </div>
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full">
                  Admin
                </span>
              </div>

              {/* Additional members */}
              {currentOrg.members
                .filter(member => member !== currentOrg.ownerAddress)
                .map((member, index) => (
                  <div key={index} className="flex items-center justify-between p-3 rounded-md bg-gray-50 border border-gray-200">
                    <div>
                      <p className="text-sm font-medium">
                        {member.slice(0, 8)}...{member.slice(-6)}
                      </p>
                      <p className="text-xs text-gray-500">Member</p>
                    </div>
                    <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
                      Member
                    </span>
                  </div>
                ))
              }
            </div>
            
            <div className="mt-4 text-sm text-gray-500">
              <p>Total members: {currentOrg.members.length}</p>
            </div>

            <Button variant="outline" size="sm" className="mt-4" disabled>
              + Invite Member (coming soon)
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Organization Info</CardTitle>
            <CardDescription>Read-only organization details</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Organization ID:</span>
                <span className="font-mono text-xs">{currentOrg.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Owner Address:</span>
                <span className="font-mono text-xs">
                  {currentOrg.ownerAddress.slice(0, 8)}...{currentOrg.ownerAddress.slice(-6)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Created:</span>
                <span>{formatDate(currentOrg.createdAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Member Count:</span>
                <span>{currentOrg.members.length}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-red-600">Danger Zone</CardTitle>
            <CardDescription>Irreversible and destructive actions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Once you delete an organization, there is no going back. All projects, agents, 
                tasks, and chat history will be permanently removed.
              </p>
              <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" disabled>
                Delete Organization (coming soon)
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}