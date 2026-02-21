'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useOrg } from '@/contexts/OrgContext';
import { useActiveAccount } from 'thirdweb/react';
import { updateOrganization } from '@/lib/firestore';
import BlurText from "@/components/reactbits/BlurText";
import SpotlightCard from "@/components/reactbits/SpotlightCard";

export default function SettingsPage() {
  const { currentOrg, refreshOrgs } = useOrg();
  const account = useActiveAccount();
  const address = account?.address;
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingSocials, setSavingSocials] = useState(false);
  const [website, setWebsite] = useState('');
  const [twitter, setTwitter] = useState('');
  const [discord, setDiscord] = useState('');
  const [telegram, setTelegram] = useState('');

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize form with current org data
  useEffect(() => {
    if (currentOrg) {
      setName(currentOrg.name);
      setDescription(currentOrg.description || '');
      setLogoPreview(currentOrg.logoUrl || null);
      setWebsite(currentOrg.website || '');
      setTwitter(currentOrg.twitter || '');
      setDiscord(currentOrg.discord || '');
      setTelegram(currentOrg.telegram || '');
    }
  }, [currentOrg]);

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentOrg) return;

    if (file.size > 500 * 1024) {
      setMessage({ type: 'error', text: 'Image must be under 500KB' });
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setLogoPreview(base64);
      try {
        await updateOrganization(currentOrg.id, { logoUrl: base64 });
        await refreshOrgs();
        setMessage({ type: 'success', text: 'Logo updated!' });
      } catch {
        setMessage({ type: 'error', text: 'Failed to save logo' });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSaveSocials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg) return;
    setSavingSocials(true);
    setMessage(null);
    try {
      await updateOrganization(currentOrg.id, {
        website: website.trim(),
        twitter: twitter.trim(),
        discord: discord.trim(),
        telegram: telegram.trim(),
      });
      await refreshOrgs();
      setMessage({ type: 'success', text: 'Social links updated!' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to update social links' });
    } finally {
      setSavingSocials(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg) return;
    
    setSaving(true);
    setMessage(null);

    try {
      await updateOrganization(currentOrg.id, {
        name: name.trim(),
        description: description.trim() || '',
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
          <BlurText text="Settings" className="text-3xl font-bold tracking-tight" delay={80} animateBy="words" />
          <p className="text-muted-foreground mt-1">No organization selected</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <BlurText text="Settings" className="text-3xl font-bold tracking-tight" delay={80} animateBy="words" />
        <p className="text-muted-foreground mt-1">Manage your organization settings</p>
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
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleLogoChange}
                />
                <div className="flex flex-col items-center gap-1">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-16 h-16 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                  >
                    {logoPreview ? (
                      <img src={logoPreview} alt="Logo" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl font-bold text-amber-600 dark:text-amber-400">{currentOrg.name.charAt(0).toUpperCase()}</span>
                    )}
                  </button>
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="text-[10px] text-muted-foreground hover:text-foreground">📷 Change Logo</button>
                </div>
                <div className="text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">{currentOrg.name}</p>
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

              {currentOrg.inviteCode && (
                <div>
                  <label className="block text-sm font-medium mb-1.5">Invite Code</label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-md border border-amber-300 bg-amber-950/30 px-3 py-2 text-lg font-bold tracking-widest text-amber-400">
                      {currentOrg.inviteCode}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(currentOrg.inviteCode || '');
                      }}
                    >
                      📋 Copy
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Share this code to invite agents to your organization</p>
                </div>
              )}

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
                  disabled={saving || !name.trim() || (name === currentOrg.name && description === (currentOrg.description || ''))}
                  className="bg-amber-600 hover:bg-amber-700 text-black"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Social Links</CardTitle>
            <CardDescription>Add links for the organization marketplace</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveSocials} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">🌐 Website</label>
                <Input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://yoursite.com" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">𝕏 Twitter / X</label>
                <Input value={twitter} onChange={(e) => setTwitter(e.target.value)} placeholder="@yourhandle" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">💬 Discord</label>
                <Input value={discord} onChange={(e) => setDiscord(e.target.value)} placeholder="https://discord.gg/invite" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">✈️ Telegram</label>
                <Input value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="https://t.me/yourchannel" />
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={savingSocials} className="bg-amber-600 hover:bg-amber-700 text-black">
                  {savingSocials ? 'Saving...' : 'Save Social Links'}
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
                  <p className="text-xs text-muted-foreground">Owner</p>
                </div>
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full">
                  Admin
                </span>
              </div>

              {/* Additional members */}
              {currentOrg.members
                .filter(member => member !== currentOrg.ownerAddress)
                .map((member, index) => (
                  <div key={index} className="flex items-center justify-between p-3 rounded-md bg-muted border border-border">
                    <div>
                      <p className="text-sm font-medium">
                        {member.slice(0, 8)}...{member.slice(-6)}
                      </p>
                      <p className="text-xs text-muted-foreground">Member</p>
                    </div>
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full">
                      Member
                    </span>
                  </div>
                ))
              }
            </div>
            
            <div className="mt-4 text-sm text-muted-foreground">
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
                <span className="text-muted-foreground">Organization ID:</span>
                <span className="font-mono text-xs truncate max-w-[200px]">{currentOrg.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Owner Address:</span>
                <span className="font-mono text-xs">
                  {currentOrg.ownerAddress.slice(0, 8)}...{currentOrg.ownerAddress.slice(-6)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created:</span>
                <span>{formatDate(currentOrg.createdAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Member Count:</span>
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
              <p className="text-sm text-muted-foreground">
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