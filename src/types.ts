import type { S3Event as AWSS3Event, S3EventRecord as AWSS3EventRecord } from 'aws-lambda'

export type S3Event = AWSS3Event
export type S3EventRecord = AWSS3EventRecord

export interface TranslationAttributes {
  version: number
  'is-published': boolean
  'manifest-name': string
}

export interface RelationshipData {
  id: string
  type: string
}

export interface Translation {
  id: string
  type: 'translation'
  attributes: TranslationAttributes
  relationships: {
    resource: { data: RelationshipData }
    language: { data: RelationshipData }
  }
}

export interface LanguageAttributes {
  code: string
  name: string
}

export interface Language {
  id: string
  type: 'language'
  attributes: LanguageAttributes
}

export interface ResourceAttributes {
  abbreviation: string
  name: string
}

export interface Resource {
  id: string
  type: 'resource'
  attributes: ResourceAttributes
}

export type IncludedRecord = Language | Resource

export interface TranslationsResponse {
  data: Translation[]
  included: IncludedRecord[]
}
