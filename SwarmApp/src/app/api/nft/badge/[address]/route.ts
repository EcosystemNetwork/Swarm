/**
 * Dynamic NFT Badge Image API — Agent Identity NFT
 *
 * Generates SVG badge image for SwarmAgentIdentityNFT.
 * Badge displays credit score tier, trust score, and agent name.
 *
 * Endpoint: GET /api/nft/badge/{agentAddress}
 * Returns: SVG image
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";

/**
 * GET /api/nft/badge/[address]
 * Returns dynamic SVG badge for an agent's NFT
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { address: string } }
) {
  try {
    const { address } = params;

    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return new NextResponse("Invalid address", { status: 400 });
    }

    const normalizedAddress = address.toLowerCase();

    // Query Firestore for agent
    const agentsRef = collection(db, "agents");
    const q = query(
      agentsRef,
      where("walletAddress", "==", normalizedAddress)
    );

    const querySnapshot = await getDocs(q);

    let name = "Unknown Agent";
    let asn = "ASN-PENDING";
    let creditScore = 0;
    let trustScore = 0;
    let tier = "None";
    let tierColor = "#64748b"; // slate
    let tierEmoji = "❓";

    if (!querySnapshot.empty) {
      const agent = querySnapshot.docs[0].data();
      name = agent.name || "Unknown Agent";
      asn = agent.asn || "ASN-PENDING";
      creditScore = agent.creditScore ?? 680;
      trustScore = agent.trustScore ?? 50;

      // Calculate tier
      if (creditScore >= 850) {
        tier = "Platinum";
        tierColor = "#06b6d4"; // cyan
        tierEmoji = "💎";
      } else if (creditScore >= 700) {
        tier = "Gold";
        tierColor = "#eab308"; // yellow
        tierEmoji = "🥇";
      } else if (creditScore >= 550) {
        tier = "Silver";
        tierColor = "#94a3b8"; // slate
        tierEmoji = "🥈";
      } else {
        tier = "Bronze";
        tierColor = "#f97316"; // orange
        tierEmoji = "🥉";
      }
    }

    // Generate SVG badge
    const svg = `<svg width="500" height="500" viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1e293b;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#0f172a;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="tierGlow" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${tierColor};stop-opacity:0.3" />
      <stop offset="100%" style="stop-color:${tierColor};stop-opacity:0.1" />
    </linearGradient>
  </defs>

  <rect width="500" height="500" fill="url(#bg)"/>

  <!-- Tier glow circle -->
  <circle cx="250" cy="150" r="80" fill="url(#tierGlow)" opacity="0.5"/>

  <!-- Tier emoji -->
  <text x="250" y="180" font-size="80" text-anchor="middle" fill="white">${tierEmoji}</text>

  <!-- Tier label -->
  <text x="250" y="250" font-size="32" font-weight="bold" text-anchor="middle" fill="${tierColor}">
    ${tier.toUpperCase()}
  </text>

  <!-- Agent name -->
  <text x="250" y="290" font-size="24" font-weight="600" text-anchor="middle" fill="white" opacity="0.9">
    ${name.length > 20 ? name.substring(0, 20) + "..." : name}
  </text>

  <!-- ASN -->
  <text x="250" y="320" font-size="14" text-anchor="middle" fill="white" opacity="0.6" font-family="monospace">
    ${asn}
  </text>

  <!-- Credit Score -->
  <g transform="translate(130, 360)">
    <rect x="0" y="0" width="100" height="60" rx="8" fill="rgba(255,255,255,0.05)" stroke="${tierColor}" stroke-width="2"/>
    <text x="50" y="25" font-size="12" text-anchor="middle" fill="white" opacity="0.7">CREDIT</text>
    <text x="50" y="50" font-size="20" font-weight="bold" text-anchor="middle" fill="${tierColor}">${creditScore}</text>
  </g>

  <!-- Trust Score -->
  <g transform="translate(270, 360)">
    <rect x="0" y="0" width="100" height="60" rx="8" fill="rgba(255,255,255,0.05)" stroke="${tierColor}" stroke-width="2"/>
    <text x="50" y="25" font-size="12" text-anchor="middle" fill="white" opacity="0.7">TRUST</text>
    <text x="50" y="50" font-size="20" font-weight="bold" text-anchor="middle" fill="${tierColor}">${trustScore}</text>
  </g>

  <!-- Swarm Protocol branding -->
  <text x="250" y="470" font-size="14" font-weight="600" text-anchor="middle" fill="white" opacity="0.4">
    SWARM PROTOCOL
  </text>
</svg>`;

    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=300", // Cache for 5 minutes (metadata updates)
      },
    });
  } catch (error) {
    console.error("NFT badge API error:", error);
    // Return fallback SVG on error
    const fallbackSvg = `<svg width="500" height="500" viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg">
  <rect width="500" height="500" fill="#1e293b"/>
  <text x="250" y="250" font-size="32" text-anchor="middle" fill="white">
    Agent Badge
  </text>
</svg>`;
    return new NextResponse(fallbackSvg, {
      headers: {
        "Content-Type": "image/svg+xml",
      },
    });
  }
}
