import type { AgentContext } from '../../../../agent'
import type { CredentialFormatService } from '../../formats'
import type {
  JsonCredential,
  JsonLdCredentialFormat,
  JsonLdCredentialDetailFormat,
} from '../../formats/jsonld/JsonLdCredentialFormat'
import type { CredentialPreviewAttribute } from '../../models/CredentialPreviewAttribute'
import type { V2OfferCredentialMessageOptions } from '../../protocol/v2/messages/V2OfferCredentialMessage'
import type { CustomCredentialTags } from '../../repository/CredentialExchangeRecord'

import { getAgentConfig, getAgentContext, mockFunction } from '../../../../../tests/helpers'
import { Attachment, AttachmentData } from '../../../../decorators/attachment/v1/Attachment'
import { JsonTransformer } from '../../../../utils'
import { JsonEncoder } from '../../../../utils/JsonEncoder'
import { DidDocument } from '../../../dids'
import { DidResolverService } from '../../../dids/services/DidResolverService'
import { W3cCredentialRecord, W3cCredentialService } from '../../../vc'
import { Ed25519Signature2018Fixtures } from '../../../vc/__tests__/fixtures'
import { CREDENTIALS_CONTEXT_V1_URL } from '../../../vc/constants'
import { W3cVerifiableCredential } from '../../../vc/models'
import { JsonLdCredentialFormatService } from '../../formats/jsonld/JsonLdCredentialFormatService'
import { CredentialState } from '../../models'
import { INDY_CREDENTIAL_OFFER_ATTACHMENT_ID } from '../../protocol/v1/messages'
import { V2CredentialPreview } from '../../protocol/v2/messages'
import { V2OfferCredentialMessage } from '../../protocol/v2/messages/V2OfferCredentialMessage'
import { CredentialExchangeRecord } from '../../repository/CredentialExchangeRecord'

jest.mock('../../../vc/W3cCredentialService')
jest.mock('../../../dids/services/DidResolverService')

const W3cCredentialServiceMock = W3cCredentialService as jest.Mock<W3cCredentialService>
const DidResolverServiceMock = DidResolverService as jest.Mock<DidResolverService>

const didDocument = JsonTransformer.fromJSON(
  {
    '@context': [
      'https://w3id.org/did/v1',
      'https://w3id.org/security/suites/ed25519-2018/v1',
      'https://w3id.org/security/suites/x25519-2019/v1',
    ],
    id: 'did:key:z6Mkgg342Ycpuk263R9d8Aq6MUaxPn1DDeHyGo38EefXmgDL',
    verificationMethod: [
      {
        id: 'did:key:z6Mkgg342Ycpuk263R9d8Aq6MUaxPn1DDeHyGo38EefXmgDL#z6Mkgg342Ycpuk263R9d8Aq6MUaxPn1DDeHyGo38EefXmgDL',
        type: 'Ed25519VerificationKey2018',
        controller: 'did:key:z6Mkgg342Ycpuk263R9d8Aq6MUaxPn1DDeHyGo38EefXmgDL',
        publicKeyBase58: '3Dn1SJNPaCXcvvJvSbsFWP2xaCjMom3can8CQNhWrTRx',
      },
    ],
    authentication: [
      'did:key:z6Mkgg342Ycpuk263R9d8Aq6MUaxPn1DDeHyGo38EefXmgDL#z6Mkgg342Ycpuk263R9d8Aq6MUaxPn1DDeHyGo38EefXmgDL',
    ],
    assertionMethod: [
      'did:key:z6Mkgg342Ycpuk263R9d8Aq6MUaxPn1DDeHyGo38EefXmgDL#z6Mkgg342Ycpuk263R9d8Aq6MUaxPn1DDeHyGo38EefXmgDL',
    ],
    keyAgreement: [
      {
        id: 'did:key:z6Mkgg342Ycpuk263R9d8Aq6MUaxPn1DDeHyGo38EefXmgDL#z6LSbkodSr6SU2trs8VUgnrnWtSm7BAPG245ggrBmSrxbv1R',
        type: 'X25519KeyAgreementKey2019',
        controller: 'did:key:z6Mkgg342Ycpuk263R9d8Aq6MUaxPn1DDeHyGo38EefXmgDL',
        publicKeyBase58: '5dTvYHaNaB7mk7iA9LqCJEHG2dGZQsvoi8WGzDRtYEf',
      },
    ],
  },
  DidDocument
)

const vcJson = {
  ...Ed25519Signature2018Fixtures.TEST_LD_DOCUMENT_SIGNED,
  credentialSubject: {
    ...Ed25519Signature2018Fixtures.TEST_LD_DOCUMENT_SIGNED.credentialSubject,
    alumniOf: 'oops',
  },
}

const vc = JsonTransformer.fromJSON(vcJson, W3cVerifiableCredential)

const credentialPreview = V2CredentialPreview.fromRecord({
  name: 'John',
  age: '99',
})

const offerAttachment = new Attachment({
  mimeType: 'application/json',
  data: new AttachmentData({
    base64:
      'eyJzY2hlbWFfaWQiOiJhYWEiLCJjcmVkX2RlZl9pZCI6IlRoN01wVGFSWlZSWW5QaWFiZHM4MVk6MzpDTDoxNzpUQUciLCJub25jZSI6Im5vbmNlIiwia2V5X2NvcnJlY3RuZXNzX3Byb29mIjp7fX0',
  }),
})

const credentialAttachment = new Attachment({
  mimeType: 'application/json',
  data: new AttachmentData({
    base64: JsonEncoder.toBase64(vcJson),
  }),
})

// A record is deserialized to JSON when it's stored into the storage. We want to simulate this behaviour for `offer`
// object to test our service would behave correctly. We use type assertion for `offer` attribute to `any`.
const mockCredentialRecord = ({
  state,
  threadId,
  connectionId,
  tags,
  id,
  credentialAttributes,
}: {
  state?: CredentialState
  tags?: CustomCredentialTags
  threadId?: string
  connectionId?: string
  id?: string
  credentialAttributes?: CredentialPreviewAttribute[]
} = {}) => {
  const offerOptions: V2OfferCredentialMessageOptions = {
    id: '',
    formats: [
      {
        attachId: INDY_CREDENTIAL_OFFER_ATTACHMENT_ID,
        format: 'hlindy/cred-abstract@v2.0',
      },
    ],
    comment: 'some comment',
    credentialPreview: credentialPreview,
    offerAttachments: [offerAttachment],
    replacementId: undefined,
  }
  const offerMessage = new V2OfferCredentialMessage(offerOptions)

  const credentialRecord = new CredentialExchangeRecord({
    id,
    credentialAttributes: credentialAttributes || credentialPreview.attributes,
    state: state || CredentialState.OfferSent,
    threadId: threadId ?? offerMessage.id,
    connectionId: connectionId ?? '123',
    tags,
    protocolVersion: 'v2',
  })

  return credentialRecord
}
const inputDocAsJson: JsonCredential = {
  '@context': [CREDENTIALS_CONTEXT_V1_URL, 'https://www.w3.org/2018/credentials/examples/v1'],
  type: ['VerifiableCredential', 'UniversityDegreeCredential'],
  issuer: 'did:key:z6Mkgg342Ycpuk263R9d8Aq6MUaxPn1DDeHyGo38EefXmgDL',
  issuanceDate: '2017-10-22T12:23:48Z',
  credentialSubject: {
    degree: {
      type: 'BachelorDegree',
      name: 'Bachelor of Science and Arts',
    },
    alumniOf: 'oops',
  },
}
const verificationMethod = `8HH5gYEeNc3z7PYXmd54d4x6qAfCNrqQqEB3nS7Zfu7K#8HH5gYEeNc3z7PYXmd54d4x6qAfCNrqQqEB3nS7Zfu7K`

const signCredentialOptions: JsonLdCredentialDetailFormat = {
  credential: inputDocAsJson,
  options: {
    proofPurpose: 'assertionMethod',
    proofType: 'Ed25519Signature2018',
  },
}

const requestAttachment = new Attachment({
  mimeType: 'application/json',
  data: new AttachmentData({
    base64: JsonEncoder.toBase64(signCredentialOptions),
  }),
})
let jsonLdFormatService: CredentialFormatService<JsonLdCredentialFormat>
let w3cCredentialService: W3cCredentialService
let didResolver: DidResolverService

describe('JsonLd CredentialFormatService', () => {
  let agentContext: AgentContext
  beforeEach(async () => {
    w3cCredentialService = new W3cCredentialServiceMock()
    didResolver = new DidResolverServiceMock()

    const agentConfig = getAgentConfig('JsonLdCredentialFormatServiceTest')
    agentContext = getAgentContext({
      registerInstances: [
        [DidResolverService, didResolver],
        [W3cCredentialService, w3cCredentialService],
      ],
      agentConfig,
    })

    jsonLdFormatService = new JsonLdCredentialFormatService()
  })

  describe('Create JsonLd Credential Proposal / Offer', () => {
    test(`Creates JsonLd Credential Proposal`, async () => {
      // when
      const { attachment, format } = await jsonLdFormatService.createProposal(agentContext, {
        credentialRecord: mockCredentialRecord(),
        credentialFormats: {
          jsonld: signCredentialOptions,
        },
      })

      // then
      expect(attachment).toMatchObject({
        id: expect.any(String),
        description: undefined,
        filename: undefined,
        mimeType: 'application/json',
        lastmodTime: undefined,
        byteCount: undefined,
        data: {
          base64:
            'eyJjcmVkZW50aWFsIjp7IkBjb250ZXh0IjpbImh0dHBzOi8vd3d3LnczLm9yZy8yMDE4L2NyZWRlbnRpYWxzL3YxIiwiaHR0cHM6Ly93d3cudzMub3JnLzIwMTgvY3JlZGVudGlhbHMvZXhhbXBsZXMvdjEiXSwidHlwZSI6WyJWZXJpZmlhYmxlQ3JlZGVudGlhbCIsIlVuaXZlcnNpdHlEZWdyZWVDcmVkZW50aWFsIl0sImlzc3VlciI6ImRpZDprZXk6ejZNa2dnMzQyWWNwdWsyNjNSOWQ4QXE2TVVheFBuMUREZUh5R28zOEVlZlhtZ0RMIiwiaXNzdWFuY2VEYXRlIjoiMjAxNy0xMC0yMlQxMjoyMzo0OFoiLCJjcmVkZW50aWFsU3ViamVjdCI6eyJkZWdyZWUiOnsidHlwZSI6IkJhY2hlbG9yRGVncmVlIiwibmFtZSI6IkJhY2hlbG9yIG9mIFNjaWVuY2UgYW5kIEFydHMifSwiYWx1bW5pT2YiOiJvb3BzIn19LCJvcHRpb25zIjp7InByb29mUHVycG9zZSI6ImFzc2VydGlvbk1ldGhvZCIsInByb29mVHlwZSI6IkVkMjU1MTlTaWduYXR1cmUyMDE4In19',
          json: undefined,
          links: undefined,
          jws: undefined,
          sha256: undefined,
        },
      })

      expect(format).toMatchObject({
        attachId: expect.any(String),
        format: 'aries/ld-proof-vc-detail@v1.0',
      })
    })

    test(`Creates JsonLd Credential Offer`, async () => {
      // when
      const { attachment, previewAttributes, format } = await jsonLdFormatService.createOffer(agentContext, {
        credentialFormats: {
          jsonld: signCredentialOptions,
        },
        credentialRecord: mockCredentialRecord(),
      })

      // then
      expect(attachment).toMatchObject({
        id: expect.any(String),
        description: undefined,
        filename: undefined,
        mimeType: 'application/json',
        lastmodTime: undefined,
        byteCount: undefined,
        data: {
          base64:
            'eyJjcmVkZW50aWFsIjp7IkBjb250ZXh0IjpbImh0dHBzOi8vd3d3LnczLm9yZy8yMDE4L2NyZWRlbnRpYWxzL3YxIiwiaHR0cHM6Ly93d3cudzMub3JnLzIwMTgvY3JlZGVudGlhbHMvZXhhbXBsZXMvdjEiXSwidHlwZSI6WyJWZXJpZmlhYmxlQ3JlZGVudGlhbCIsIlVuaXZlcnNpdHlEZWdyZWVDcmVkZW50aWFsIl0sImlzc3VlciI6ImRpZDprZXk6ejZNa2dnMzQyWWNwdWsyNjNSOWQ4QXE2TVVheFBuMUREZUh5R28zOEVlZlhtZ0RMIiwiaXNzdWFuY2VEYXRlIjoiMjAxNy0xMC0yMlQxMjoyMzo0OFoiLCJjcmVkZW50aWFsU3ViamVjdCI6eyJkZWdyZWUiOnsidHlwZSI6IkJhY2hlbG9yRGVncmVlIiwibmFtZSI6IkJhY2hlbG9yIG9mIFNjaWVuY2UgYW5kIEFydHMifSwiYWx1bW5pT2YiOiJvb3BzIn19LCJvcHRpb25zIjp7InByb29mUHVycG9zZSI6ImFzc2VydGlvbk1ldGhvZCIsInByb29mVHlwZSI6IkVkMjU1MTlTaWduYXR1cmUyMDE4In19',
          json: undefined,
          links: undefined,
          jws: undefined,
          sha256: undefined,
        },
      })

      expect(previewAttributes).toBeUndefined()

      expect(format).toMatchObject({
        attachId: expect.any(String),
        format: 'aries/ld-proof-vc-detail@v1.0',
      })
    })
  })

  describe('Accept Credential Offer', () => {
    test('returns credential request message base on existing credential offer message', async () => {
      // when
      const { attachment, format } = await jsonLdFormatService.acceptOffer(agentContext, {
        credentialFormats: {
          jsonld: undefined,
        },
        offerAttachment,
        credentialRecord: mockCredentialRecord({
          state: CredentialState.OfferReceived,
          threadId: 'fd9c5ddb-ec11-4acd-bc32-540736249746',
          connectionId: 'b1e2f039-aa39-40be-8643-6ce2797b5190',
        }),
      })

      // then
      expect(attachment).toMatchObject({
        id: expect.any(String),
        description: undefined,
        filename: undefined,
        mimeType: 'application/json',
        lastmodTime: undefined,
        byteCount: undefined,
        data: {
          base64:
            'eyJzY2hlbWFfaWQiOiJhYWEiLCJjcmVkX2RlZl9pZCI6IlRoN01wVGFSWlZSWW5QaWFiZHM4MVk6MzpDTDoxNzpUQUciLCJub25jZSI6Im5vbmNlIiwia2V5X2NvcnJlY3RuZXNzX3Byb29mIjp7fX0=',
          json: undefined,
          links: undefined,
          jws: undefined,
          sha256: undefined,
        },
      })
      expect(format).toMatchObject({
        attachId: expect.any(String),
        format: 'aries/ld-proof-vc-detail@v1.0',
      })
    })
  })

  describe('Accept Request', () => {
    const threadId = 'fd9c5ddb-ec11-4acd-bc32-540736249746'

    test('Derive Verification Method', async () => {
      mockFunction(didResolver.resolveDidDocument).mockReturnValue(Promise.resolve(didDocument))
      mockFunction(w3cCredentialService.getVerificationMethodTypesByProofType).mockReturnValue([
        'Ed25519VerificationKey2018',
      ])

      const service = jsonLdFormatService as JsonLdCredentialFormatService
      const credentialRequest = requestAttachment.getDataAsJson<JsonLdCredentialDetailFormat>()

      // calls private method in the format service
      const verificationMethod = await service['deriveVerificationMethod'](
        agentContext,
        signCredentialOptions.credential,
        credentialRequest
      )
      expect(verificationMethod).toBe(
        'did:key:z6Mkgg342Ycpuk263R9d8Aq6MUaxPn1DDeHyGo38EefXmgDL#z6Mkgg342Ycpuk263R9d8Aq6MUaxPn1DDeHyGo38EefXmgDL'
      )
    })

    test('Creates a credential', async () => {
      // given
      mockFunction(w3cCredentialService.signCredential).mockReturnValue(Promise.resolve(vc))

      const credentialRecord = mockCredentialRecord({
        state: CredentialState.RequestReceived,
        threadId,
        connectionId: 'b1e2f039-aa39-40be-8643-6ce2797b5190',
      })

      const { format, attachment } = await jsonLdFormatService.acceptRequest(agentContext, {
        credentialRecord,
        credentialFormats: {
          jsonld: {
            verificationMethod,
          },
        },
        requestAttachment,
        offerAttachment,
      })
      //then
      expect(w3cCredentialService.signCredential).toHaveBeenCalledTimes(1)

      expect(attachment).toMatchObject({
        id: expect.any(String),
        description: undefined,
        filename: undefined,
        mimeType: 'application/json',
        lastmodTime: undefined,
        byteCount: undefined,
        data: {
          base64: expect.any(String),
          json: undefined,
          links: undefined,
          jws: undefined,
          sha256: undefined,
        },
      })
      expect(format).toMatchObject({
        attachId: expect.any(String),
        format: 'aries/ld-proof-vc@1.0',
      })
    })
  })

  describe('Process Credential', () => {
    const credentialRecord = mockCredentialRecord({
      state: CredentialState.RequestSent,
    })
    let w3c: W3cCredentialRecord
    let signCredentialOptionsWithProperty: JsonLdCredentialDetailFormat
    beforeEach(async () => {
      signCredentialOptionsWithProperty = signCredentialOptions
      signCredentialOptionsWithProperty.options = {
        proofPurpose: 'assertionMethod',
        proofType: 'Ed25519Signature2018',
      }

      w3c = new W3cCredentialRecord({
        id: 'foo',
        createdAt: new Date(),
        credential: vc,
        tags: {
          expandedTypes: [
            'https://www.w3.org/2018/credentials#VerifiableCredential',
            'https://example.org/examples#UniversityDegreeCredential',
          ],
        },
      })
    })
    test('finds credential record by thread ID and saves credential attachment into the wallet', async () => {
      // given
      mockFunction(w3cCredentialService.storeCredential).mockReturnValue(Promise.resolve(w3c))

      // when
      await jsonLdFormatService.processCredential(agentContext, {
        attachment: credentialAttachment,
        requestAttachment: requestAttachment,
        credentialRecord,
      })

      // then
      expect(w3cCredentialService.storeCredential).toHaveBeenCalledTimes(1)
      expect(credentialRecord.credentials.length).toBe(1)
      expect(credentialRecord.credentials[0].credentialRecordType).toBe('w3c')
      expect(credentialRecord.credentials[0].credentialRecordId).toBe('foo')
    })

    test('throws error if credential subject not equal to request subject', async () => {
      const vcJson = {
        ...Ed25519Signature2018Fixtures.TEST_LD_DOCUMENT_SIGNED,
        credentialSubject: {
          ...Ed25519Signature2018Fixtures.TEST_LD_DOCUMENT_SIGNED.credentialSubject,
          // missing alumni
        },
      }

      const credentialAttachment = new Attachment({
        mimeType: 'application/json',
        data: new AttachmentData({
          base64: JsonEncoder.toBase64(vcJson),
        }),
      })

      // given
      mockFunction(w3cCredentialService.storeCredential).mockReturnValue(Promise.resolve(w3c))

      // when/then
      await expect(
        jsonLdFormatService.processCredential(agentContext, {
          attachment: credentialAttachment,
          requestAttachment: requestAttachment,
          credentialRecord,
        })
      ).rejects.toThrow('Received credential does not match credential request')
    })

    test('throws error if credential domain not equal to request domain', async () => {
      // this property is not supported yet by us, but could be in the credential we received
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      signCredentialOptionsWithProperty.options.domain = 'https://test.com'
      const requestAttachmentWithDomain = new Attachment({
        mimeType: 'application/json',
        data: new AttachmentData({
          base64: JsonEncoder.toBase64(signCredentialOptionsWithProperty),
        }),
      })
      // given
      mockFunction(w3cCredentialService.storeCredential).mockReturnValue(Promise.resolve(w3c))

      // when/then
      await expect(
        jsonLdFormatService.processCredential(agentContext, {
          attachment: credentialAttachment,
          requestAttachment: requestAttachmentWithDomain,
          credentialRecord,
        })
      ).rejects.toThrow('Received credential proof domain does not match domain from credential request')
    })

    test('throws error if credential challenge not equal to request challenge', async () => {
      // this property is not supported yet by us, but could be in the credential we received
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      signCredentialOptionsWithProperty.options.challenge = '7bf32d0b-39d4-41f3-96b6-45de52988e4c'

      const requestAttachmentWithChallenge = new Attachment({
        mimeType: 'application/json',
        data: new AttachmentData({
          base64: JsonEncoder.toBase64(signCredentialOptionsWithProperty),
        }),
      })

      // given
      mockFunction(w3cCredentialService.storeCredential).mockReturnValue(Promise.resolve(w3c))

      // when/then
      await expect(
        jsonLdFormatService.processCredential(agentContext, {
          attachment: credentialAttachment,
          requestAttachment: requestAttachmentWithChallenge,
          credentialRecord,
        })
      ).rejects.toThrow('Received credential proof challenge does not match challenge from credential request')
    })

    test('throws error if credential proof type not equal to request proof type', async () => {
      signCredentialOptionsWithProperty.options.proofType = 'Ed25519Signature2016'
      const requestAttachmentWithProofType = new Attachment({
        mimeType: 'application/json',
        data: new AttachmentData({
          base64: JsonEncoder.toBase64(signCredentialOptionsWithProperty),
        }),
      })

      // given
      mockFunction(w3cCredentialService.storeCredential).mockReturnValue(Promise.resolve(w3c))

      // when/then
      await expect(
        jsonLdFormatService.processCredential(agentContext, {
          attachment: credentialAttachment,
          requestAttachment: requestAttachmentWithProofType,
          credentialRecord,
        })
      ).rejects.toThrow('Received credential proof type does not match proof type from credential request')
    })

    test('throws error if credential proof purpose not equal to request proof purpose', async () => {
      signCredentialOptionsWithProperty.options.proofPurpose = 'authentication'
      const requestAttachmentWithProofPurpose = new Attachment({
        mimeType: 'application/json',
        data: new AttachmentData({
          base64: JsonEncoder.toBase64(signCredentialOptionsWithProperty),
        }),
      })

      // given
      mockFunction(w3cCredentialService.storeCredential).mockReturnValue(Promise.resolve(w3c))

      // when/then
      await expect(
        jsonLdFormatService.processCredential(agentContext, {
          attachment: credentialAttachment,
          requestAttachment: requestAttachmentWithProofPurpose,
          credentialRecord,
        })
      ).rejects.toThrow('Received credential proof purpose does not match proof purpose from credential request')
    })

    test('are credentials equal', async () => {
      const message1 = new Attachment({
        id: 'cdb0669b-7cd6-46bc-b1c7-7034f86083ac',
        mimeType: 'application/json',
        data: new AttachmentData({
          base64: JsonEncoder.toBase64(inputDocAsJson),
        }),
      })

      const message2 = new Attachment({
        id: '9a8ff4fb-ac86-478f-b7f9-fbf3f9cc60e6',
        mimeType: 'application/json',
        data: new AttachmentData({
          base64: JsonEncoder.toBase64(inputDocAsJson),
        }),
      })

      // indirectly test areCredentialsEqual as black box rather than expose that method in the API
      let areCredentialsEqual = jsonLdFormatService.shouldAutoRespondToProposal(agentContext, {
        credentialRecord,
        proposalAttachment: message1,
        offerAttachment: message2,
      })
      expect(areCredentialsEqual).toBe(true)

      const inputDoc2 = {
        '@context': [
          'https://www.w3.org/2018/credentials/v1',
          'https://w3id.org/citizenship/v1',
          'https://w3id.org/security/bbs/v1',
        ],
      }
      message2.data = new AttachmentData({
        base64: JsonEncoder.toBase64(inputDoc2),
      })

      areCredentialsEqual = jsonLdFormatService.shouldAutoRespondToProposal(agentContext, {
        credentialRecord,
        proposalAttachment: message1,
        offerAttachment: message2,
      })
      expect(areCredentialsEqual).toBe(false)
    })
  })
})
