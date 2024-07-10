import { CompanionStaticUpgradeProps, CompanionStaticUpgradeResult, CompanionUpgradeContext, type CompanionStaticUpgradeScript } from '@companion-module/base'
import { ConnectionConfig } from './vertex.js'

export const UpgradeScripts: CompanionStaticUpgradeScript<ConnectionConfig>[] = [
        updatedConfig,
        updatedActions,
        updatedFeedbacks,
]
function updatedConfig(_context: CompanionUpgradeContext<ConnectionConfig>, _props: CompanionStaticUpgradeProps<ConnectionConfig>): CompanionStaticUpgradeResult<ConnectionConfig> {
    throw new Error('Function not implemented.')
}

function updatedActions(_context: CompanionUpgradeContext<ConnectionConfig>, _props: CompanionStaticUpgradeProps<ConnectionConfig>): CompanionStaticUpgradeResult<ConnectionConfig> {
    throw new Error('Function not implemented.')
}

function updatedFeedbacks(_context: CompanionUpgradeContext<ConnectionConfig>, _props: CompanionStaticUpgradeProps<ConnectionConfig>): CompanionStaticUpgradeResult<ConnectionConfig> {
    throw new Error('Function not implemented.')
}

