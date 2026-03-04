import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

const OPENCLAW_DIR = process.env.OPENCLAW_DIR || path.join(os.homedir(), '.openclaw');
const AGENT_ID = process.env.OPENCLAW_AGENT || 'main';
const memDir = path.join(OPENCLAW_DIR, 'agents', AGENT_ID, 'memory');

function getCronFile() {
    return path.join(memDir, 'CRON.json');
}

export async function GET() {
    try {
        const cronFile = getCronFile();
        if (!fs.existsSync(cronFile)) {
            return NextResponse.json({ config: {} });
        }
        const data = fs.readFileSync(cronFile, 'utf8');
        return NextResponse.json({ config: JSON.parse(data) });
    } catch (error) {
        console.error('Error fetching cron jobs:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const action = body.action; // 'toggle', 'trigger', 'update'
        const cronFile = getCronFile();

        // Safety
        if (!fs.existsSync(memDir)) {
            fs.mkdirSync(memDir, { recursive: true });
        }

        let config: any = {};
        if (fs.existsSync(cronFile)) {
            try {
                config = JSON.parse(fs.readFileSync(cronFile, 'utf8'));
            } catch (e) {
                config = {};
            }
        }

        if (action === 'toggle') {
            const { taskId, active } = body;
            if (taskId && config[taskId]) {
                config[taskId].active = active;
                fs.writeFileSync(cronFile, JSON.stringify(config, null, 2));
            }
            return NextResponse.json({ success: true, config });
        }

        if (action === 'trigger') {
            const { prompt } = body;
            // Note: Because LuckyApp is just a UI layer over OpenClaw, 
            // we mock triggering by appending an action to an 'INBOX' or sending an IPC message.
            // For now, it's just a mock log.
            console.log(`[Swarm] Manually triggered cron action: ${prompt}`);
            return NextResponse.json({ success: true, message: 'Action triggered asynchronously' });
        }

        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });

    } catch (error) {
        console.error('Error modifying cron jobs:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
