import type { EthUsdRate } from './types'

const WEI_PER_ETH = 1_000_000_000_000_000_000n
const USD_SCALE = 100n
const RATE_SCALE = 100_000_000n
const RATE_DECIMALS = 8
const DEFAULT_RATE_DISPLAY_DECIMALS = 2
const DEFAULT_ETH_DISPLAY_DECIMALS = 6

export {
    WEI_PER_ETH,
    USD_SCALE,
    RATE_SCALE,
}

export function mention(userId: string): string {
    return `<@${userId}>`
}

export function parseUsdAmount(raw: string): bigint {
    const normalized = raw.trim()
    if (!normalized) {
        throw new Error('Amount is required (example: 25 or 25.50).')
    }

    if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
        throw new Error('Use a USD amount with up to two decimals (example: 25 or 25.50).')
    }

    const [whole, fraction = ''] = normalized.split('.')
    const paddedFraction = (fraction + '00').slice(0, 2)
    return BigInt(whole) * USD_SCALE + BigInt(paddedFraction)
}

export function formatUsd(cents: bigint): string {
    return formatCurrency(cents, USD_SCALE, 2, 'USD')
}

export function formatEth(wei: bigint, decimals = DEFAULT_ETH_DISPLAY_DECIMALS): string {
    return formatCurrency(wei, WEI_PER_ETH, decimals, 'ETH')
}

export function formatRate(rate: EthUsdRate, decimals = DEFAULT_RATE_DISPLAY_DECIMALS): string {
    const price = formatScaledValue(rate.value, RATE_SCALE, decimals)
    const timestamp = rate.fetchedAt.toLocaleString()
    return `1 ETH = USD ${price} (source: ${rate.source}, fetched ${timestamp})`
}

export function weiToUsdCents(wei: bigint, rate: bigint): bigint {
    const numerator = wei * rate * USD_SCALE
    const denominator = WEI_PER_ETH * RATE_SCALE
    return divideBigIntRounded(numerator, denominator)
}

export function usdCentsToWei(usdCents: bigint, rate: bigint): bigint {
    const numerator = usdCents * RATE_SCALE * WEI_PER_ETH
    const denominator = USD_SCALE * rate
    return divideBigIntRounded(numerator, denominator)
}

export async function resolveEthUsdRate(): Promise<EthUsdRate> {
    const fetched = await tryFetchRate()
    if (fetched) {
        return fetched
    }

    const envRate = parseRateFromEnv()
    if (envRate) {
        return envRate
    }

    throw new Error('Unable to resolve ETH/USD exchange rate. Set ETH_USD_RATE env variable or enable outbound network access.')
}

function parseRateFromEnv(): EthUsdRate | null {
    const envValue = process.env.ETH_USD_RATE?.trim()
    if (!envValue) {
        return null
    }

    const scaled = toScaledBigInt(envValue, RATE_DECIMALS)
    if (scaled <= 0n) {
        throw new Error('ETH_USD_RATE must be greater than zero.')
    }

    return {
        value: scaled,
        fetchedAt: new Date(),
        source: 'env(ETH_USD_RATE)',
    }
}

async function tryFetchRate(): Promise<EthUsdRate | null> {
    try {
        const response = await fetch(
            'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
        )

        if (!response.ok) {
            console.warn("Failed to fetch ETH/USD rate from CoinGecko:", response.statusText)
            return null
        }

        const body = (await response.json()) as { ethereum?: { usd?: number } }
        const usdPrice = body?.ethereum?.usd

        if (typeof usdPrice !== 'number' || !Number.isFinite(usdPrice) || usdPrice <= 0) {
            console.warn('Invalid ETH/USD rate from CoinGecko:', usdPrice)
            return null
        }

        const scaled = toScaledBigInt(usdPrice.toFixed(RATE_DECIMALS), RATE_DECIMALS)

        return {
            value: scaled,
            fetchedAt: new Date(),
            source: 'CoinGecko',
        }
    } catch (error) {
        console.warn('Failed to fetch ETH/USD rate:', error)
        return null
    }
}

function formatCurrency(value: bigint, scale: bigint, decimals: number, prefix: string): string {
    const sign = value < 0n ? '-' : ''
    const absolute = value < 0n ? -value : value
    const factor = pow10(decimals)
    const scaled = divideBigIntRounded(absolute * factor, scale)
    const integer = scaled / factor
    let fraction = (scaled % factor).toString().padStart(decimals, '0')
    fraction = fraction.replace(/0+$/, '')

    const integerWithSeparators = addThousandSeparators(integer.toString())

    return fraction.length > 0
        ? `${sign}${prefix} ${integerWithSeparators}.${fraction}`
        : `${sign}${prefix} ${integerWithSeparators}`
}

function formatScaledValue(value: bigint, scale: bigint, decimals: number): string {
    const sign = value < 0n ? '-' : ''
    const absolute = value < 0n ? -value : value
    const factor = pow10(decimals)
    const scaled = divideBigIntRounded(absolute * factor, scale)
    const integer = scaled / factor
    let fraction = (scaled % factor).toString().padStart(decimals, '0')
    fraction = fraction.replace(/0+$/, '')

    return fraction.length > 0 ? `${sign}${integer}.${fraction}` : `${sign}${integer}`
}

function divideBigIntRounded(numerator: bigint, denominator: bigint): bigint {
    if (denominator === 0n) {
        throw new Error('Cannot divide by zero.')
    }

    if (numerator === 0n) {
        return 0n
    }

    const negative = (numerator < 0n) !== (denominator < 0n)
    const absNumerator = numerator < 0n ? -numerator : numerator
    const absDenominator = denominator < 0n ? -denominator : denominator

    let quotient = absNumerator / absDenominator
    const remainder = absNumerator % absDenominator

    if (remainder * 2n >= absDenominator) {
        quotient += 1n
    }

    return negative ? -quotient : quotient
}

function addThousandSeparators(value: string): string {
    const negative = value.startsWith('-')
    const numeric = negative ? value.slice(1) : value
    const withSeparators = numeric.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    return negative ? `-${withSeparators}` : withSeparators
}

function toScaledBigInt(raw: string, decimals: number): bigint {
    const normalized = raw.trim()
    if (!normalized) {
        throw new Error('Value must not be empty.')
    }

    if (!/^\d+(\.\d+)?$/.test(normalized)) {
        throw new Error(`Invalid numeric format: ${raw}`)
    }

    const [whole, fraction = ''] = normalized.split('.')
    const paddedFraction = (fraction + '0'.repeat(decimals)).slice(0, decimals)
    return BigInt(whole) * pow10(decimals) + BigInt(paddedFraction)
}

function pow10(exp: number): bigint {
    let result = 1n
    for (let i = 0; i < exp; i++) {
        result *= 10n
    }
    return result
}
