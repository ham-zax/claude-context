import crypto from 'node:crypto';
export interface ProviderRequestContractV1 {
    schemaVersion: 'ranking_provider_request_contract_v1'; projectionIdentity: string; candidateOrder: 'baseline_admission_order';
    documentSerializationIdentity: string; identityMappingIdentity: string; maximumCandidateCount: number; maximumPayloadUtf8Bytes: number;
    timeoutMs: number; maximumRetries: number; canonicalizationIdentity: string;
}
export interface SearchCandidateForProviderV1 { candidateId: string; document: unknown; }
export interface FixedProviderTargetV1 { providerTarget: 'fixed'; serviceClass: 'online'|'offline_linux_x64'; providerKey: string; rerankerIdentity: string; rerankerProjectionIdentity: string; providerConfigurationDigest: string; }
const KEYS=['schemaVersion','projectionIdentity','candidateOrder','documentSerializationIdentity','identityMappingIdentity','maximumCandidateCount','maximumPayloadUtf8Bytes','timeoutMs','maximumRetries','canonicalizationIdentity'].sort();
function canonical(value: unknown): string { if(Array.isArray(value)) return `[${value.map(canonical).join(',')}]`; if(value&&typeof value==='object') return `{${Object.keys(value as Record<string,unknown>).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(',')}}`; return JSON.stringify(value); }
function digest(value: unknown): string { return crypto.createHash('sha256').update(canonical(value)).digest('hex'); }
function text(value: unknown,label:string):string { if(typeof value!=='string'||value.length===0) throw new Error(`${label} must be non-empty.`); return value; }
function integer(value:unknown,label:string,min:number):number { if(!Number.isSafeInteger(value)||(value as number)<min) throw new Error(`${label} must be a safe integer >= ${min}.`); return value as number; }
export function parseProviderRequestContractV1(value: unknown): ProviderRequestContractV1 {
    if(!value||typeof value!=='object'||Array.isArray(value)) throw new Error('ProviderRequestContractV1 must be an object.');
    const r=value as Record<string,unknown>, actual=Object.keys(r).sort(); if(actual.length!==KEYS.length||actual.some((k,i)=>k!==KEYS[i])) throw new Error('ProviderRequestContractV1 must contain exact keys.');
    if(r.schemaVersion!=='ranking_provider_request_contract_v1'||r.candidateOrder!=='baseline_admission_order') throw new Error('Provider request contract schema/order mismatch.');
    return {schemaVersion:'ranking_provider_request_contract_v1',projectionIdentity:text(r.projectionIdentity,'projectionIdentity'),candidateOrder:'baseline_admission_order',documentSerializationIdentity:text(r.documentSerializationIdentity,'documentSerializationIdentity'),identityMappingIdentity:text(r.identityMappingIdentity,'identityMappingIdentity'),maximumCandidateCount:integer(r.maximumCandidateCount,'maximumCandidateCount',1),maximumPayloadUtf8Bytes:integer(r.maximumPayloadUtf8Bytes,'maximumPayloadUtf8Bytes',1),timeoutMs:integer(r.timeoutMs,'timeoutMs',1),maximumRetries:integer(r.maximumRetries,'maximumRetries',0),canonicalizationIdentity:text(r.canonicalizationIdentity,'canonicalizationIdentity')};
}
export function canonicalProviderRequestContractSha256V1(value: unknown): string { return digest(parseProviderRequestContractV1(value)); }
export function buildRankingProviderRequestV1(input:{contract:ProviderRequestContractV1;expectedProviderRequestContractSha256:string;baselineAdmissionCandidates:readonly SearchCandidateForProviderV1[];target:FixedProviderTargetV1}) {
    const contract=parseProviderRequestContractV1(input.contract), contractSha=canonicalProviderRequestContractSha256V1(contract);
    if(contractSha!==input.expectedProviderRequestContractSha256) throw new Error('Provider request contract digest mismatch.');
    if(input.target.providerTarget!=='fixed'||input.target.rerankerProjectionIdentity!==contract.projectionIdentity) throw new Error('Provider target projection identity mismatch.');
    if(!/^[a-f0-9]{64}$/.test(input.target.providerConfigurationDigest)) throw new Error('Provider configuration digest is invalid.');
    if(input.baselineAdmissionCandidates.length>contract.maximumCandidateCount) throw new Error('Provider candidate count exceeds contract.');
    const seen=new Set<string>(); const orderedCandidateIds:string[]=[];
    const candidates=input.baselineAdmissionCandidates.map((candidate)=>{ if(typeof candidate.candidateId!=='string'||!candidate.candidateId) throw new Error('candidateId must be non-empty.'); if(seen.has(candidate.candidateId)) throw new Error('Provider candidates contain duplicate candidate IDs.'); seen.add(candidate.candidateId); orderedCandidateIds.push(candidate.candidateId); return {candidateId:candidate.candidateId,document:candidate.document}; });
    const requestPayload={providerKey:input.target.providerKey,rerankerIdentity:input.target.rerankerIdentity,projectionIdentity:contract.projectionIdentity,candidates};
    const bytes=Buffer.from(canonical(requestPayload),'utf8'); if(bytes.length>contract.maximumPayloadUtf8Bytes) throw new Error('Provider request payload exceeds UTF-8 byte limit.');
    return {providerRequestContractSha256:contractSha,orderedCandidateIds,requestPayload,canonicalRequestSha256:crypto.createHash('sha256').update(bytes).digest('hex')};
}
