/**
 * Swarm Agent Monitor — CRE Workflow
 *
 * A Chainlink CRE workflow that monitors the Swarm multi-agent platform.
 *
 * Every 10 minutes:
 * 1. Fetches agent fleet status from the Swarm platform API
 * 2. Reads ETH/USD price from Chainlink oracle on Sepolia
 * 3. Computes a platform health snapshot (agents online, tasks, treasury value)
 * 4. Returns aggregated metrics via consensus
 *
 * This demonstrates CRE's ability to bridge offchain AI agent orchestration
 * with onchain oracle data — the core thesis of Swarm Protocol.
 */

import {
	bytesToHex,
	CronCapability,
	consensusMedianAggregation,
	ConsensusAggregationByFields,
	EVMClient,
	encodeCallMsg,
	getNetwork,
	HTTPCapability,
	HTTPClient,
	type HTTPSendRequester,
	handler,
	LAST_FINALIZED_BLOCK_NUMBER,
	median,
	ok,
	Runner,
	type Runtime,
	text,
} from '@chainlink/cre-sdk'
import { type Address, decodeFunctionResult, encodeFunctionData, zeroAddress } from 'viem'
import { z } from 'zod'

// ═══════════════════════════════════════════════════════════════
// Config Schema
// ═══════════════════════════════════════════════════════════════

const configSchema = z.object({
	// Cron schedule (e.g. every 10 minutes)
	schedule: z.string(),
	/** Swarm Hub API base URL */
	swarmApiUrl: z.string(),
	/** Organization ID to monitor */
	orgId: z.string(),
	/** Agent ID for API auth */
	agentId: z.string(),
	/** API key for Swarm API auth */
	apiKey: z.string(),
	/** EVM chain config for oracle reads */
	evm: z.object({
		/** Chainlink ETH/USD price feed on Sepolia */
		priceFeedAddress: z.string(),
		/** CRE chain selector name */
		chainSelectorName: z.string(),
	}),
})

type Config = z.infer<typeof configSchema>

// ═══════════════════════════════════════════════════════════════
// ABI — Chainlink AggregatorV3Interface (latestRoundData only)
// ═══════════════════════════════════════════════════════════════

const AggregatorV3ABI = [
	{
		inputs: [],
		name: 'latestRoundData',
		outputs: [
			{ name: 'roundId', type: 'uint80' },
			{ name: 'answer', type: 'int256' },
			{ name: 'startedAt', type: 'uint256' },
			{ name: 'updatedAt', type: 'uint256' },
			{ name: 'answeredInRound', type: 'uint80' },
		],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [],
		name: 'decimals',
		outputs: [{ name: '', type: 'uint8' }],
		stateMutability: 'view',
		type: 'function',
	},
] as const

// ═══════════════════════════════════════════════════════════════
// Swarm Platform Data Types
// ═══════════════════════════════════════════════════════════════

interface SwarmStatus {
	totalAgents: number
	onlineAgents: number
	busyAgents: number
	offlineAgents: number
	healthScore: number // 0-100
}

// ═══════════════════════════════════════════════════════════════
// Step 1: Fetch Swarm Platform Status (offchain)
// ═══════════════════════════════════════════════════════════════

const fetchSwarmStatus = (sendRequester: HTTPSendRequester, config: Config): SwarmStatus => {
	const url = `${config.swarmApiUrl}/api/v1/agents?org=${config.orgId}&agentId=${config.agentId}&apiKey=${config.apiKey}`

	const response = sendRequester.sendRequest({
		url,
		method: 'GET',
	}).result()

	if (!ok(response)) {
		throw new Error(`Swarm API request failed with status: ${response.statusCode}`)
	}

	const body = text(response)
	const data = JSON.parse(body)

	const agents = data.agents || []
	const total = agents.length
	const online = agents.filter((a: { status: string }) => a.status === 'online').length
	const busy = agents.filter((a: { status: string }) => a.status === 'busy').length
	const offline = total - online - busy

	// Health score: weighted average of online + busy agents vs total
	// 100 = all online, 0 = all offline
	const healthScore = total > 0
		? Math.round(((online * 1.0 + busy * 0.7) / total) * 100)
		: 0

	return {
		totalAgents: total,
		onlineAgents: online,
		busyAgents: busy,
		offlineAgents: offline,
		healthScore,
	}
}

// ═══════════════════════════════════════════════════════════════
// Step 2: Read ETH/USD Price from Chainlink Oracle (onchain)
// ═══════════════════════════════════════════════════════════════

const readEthPrice = (runtime: Runtime<Config>): number => {
	const network = getNetwork({
		chainFamily: 'evm',
		chainSelectorName: runtime.config.evm.chainSelectorName,
		isTestnet: true,
	})

	if (!network) {
		throw new Error(`Network not found: ${runtime.config.evm.chainSelectorName}`)
	}

	const evmClient = new EVMClient(network.chainSelector.selector)

	// Call latestRoundData() on the AggregatorV3 price feed
	const callData = encodeFunctionData({
		abi: AggregatorV3ABI,
		functionName: 'latestRoundData',
	})

	const contractCall = evmClient
		.callContract(runtime, {
			call: encodeCallMsg({
				from: zeroAddress,
				to: runtime.config.evm.priceFeedAddress as Address,
				data: callData,
			}),
			blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
		})
		.result()

	const [, answer, , ,] = decodeFunctionResult({
		abi: AggregatorV3ABI,
		functionName: 'latestRoundData',
		data: bytesToHex(contractCall.data),
	})

	// Chainlink price feeds return 8 decimals for USD pairs
	const priceUsd = Number(answer) / 1e8

	return priceUsd
}

// ═══════════════════════════════════════════════════════════════
// Main Trigger Handler
// ═══════════════════════════════════════════════════════════════

const runMonitor = (runtime: Runtime<Config>) => {
	// 1. Fetch platform status from Swarm API with consensus
	runtime.log('Fetching Swarm platform status...')

	const httpCapability = new HTTPClient()
	const swarmStatus = httpCapability
		.sendRequest(
			runtime,
			fetchSwarmStatus,
			ConsensusAggregationByFields<SwarmStatus>({
				totalAgents: median,
				onlineAgents: median,
				busyAgents: median,
				offlineAgents: median,
				healthScore: median,
			}),
		)(runtime.config)
		.result()

	runtime.log(
		`Platform status: ${swarmStatus.onlineAgents}/${swarmStatus.totalAgents} online, ` +
		`${swarmStatus.busyAgents} busy, health=${swarmStatus.healthScore}%`
	)

	// 2. Read ETH/USD from Chainlink oracle on Sepolia
	runtime.log('Reading ETH/USD price from Chainlink oracle...')
	const ethPriceUsd = readEthPrice(runtime)
	runtime.log(`ETH/USD: $${ethPriceUsd.toFixed(2)}`)

	// 3. Compose the monitoring snapshot
	const snapshot = {
		timestamp: Date.now(),
		platform: {
			totalAgents: swarmStatus.totalAgents,
			onlineAgents: swarmStatus.onlineAgents,
			busyAgents: swarmStatus.busyAgents,
			offlineAgents: swarmStatus.offlineAgents,
			healthScore: swarmStatus.healthScore,
		},
		oracle: {
			ethUsd: ethPriceUsd,
		},
	}

	runtime.log(`=== Snapshot complete: ${JSON.stringify(snapshot)} ===`)

	return snapshot
}

const onCronTrigger = (runtime: Runtime<Config>) => {
	runtime.log('=== Swarm Agent Monitor: Cron trigger fired ===')
	return runMonitor(runtime)
}

// HTTP trigger handler — allows on-demand checks
const onHttpTrigger = (runtime: Runtime<Config>) => {
	runtime.log('=== Swarm Agent Monitor: HTTP trigger received ===')
	return runMonitor(runtime)
}

// ═══════════════════════════════════════════════════════════════
// Workflow Init
// ═══════════════════════════════════════════════════════════════

const initWorkflow = (config: Config) => {
	const cron = new CronCapability()
	const http = new HTTPCapability()

	return [
		// Primary: cron-based monitoring every 10 minutes
		handler(
			cron.trigger({ schedule: config.schedule }),
			onCronTrigger,
		),
		// Secondary: on-demand HTTP trigger for manual checks
		handler(
			http.trigger({}),
			onHttpTrigger,
		),
	]
}

export async function main() {
	const runner = await Runner.newRunner<Config>({
		configSchema,
	})
	await runner.run(initWorkflow)
}
