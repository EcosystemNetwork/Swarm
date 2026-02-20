import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function ChatPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Command Channel</h1>
        <p className="text-gray-500 mt-1">Issue commands to your swarms</p>
      </div>

      <Card className="h-[60vh] flex flex-col">
        <CardHeader>
          <CardTitle className="text-lg">Mission Control</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col justify-end gap-4">
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            Command interface coming soon...
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Type a command..."
              className="flex-1 rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              disabled
            />
            <Button disabled>Send</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
