---
title: Voxcribe: API Documentation
description: |
  This document describes how other programs talk to the Voxcribe server. It covers the ordinary requests that create, read, change and delete saved transcripts, the request that returns the dashboard figures, and the live connection that turns speech into text while a person is talking.
  It is written for developers who build a client for Voxcribe, and for testers who check the server directly. Each part starts with a plain description, and the exact names, limits and messages are given in tables. The same information is available in the Swagger page that the server publishes.
document_type: API Documentation
prepared_by: NITHISH KUMAR R
product_service: Voxcribe, Speech to Text
version: 1.0
date: 25 November 2026
---

# Overview

The server offers two ways to work with it. Ordinary requests over HTTP create, list, change and delete saved transcripts. A live connection, called a WebSocket, accepts sound and returns text while the person is still speaking.

Everything is sent as JSON, except the sound, which is sent as raw bytes. The server has no sign-in, so every request is accepted if it comes from an allowed web address. The Swagger page, where each request can be tried from the browser, is published by the server at the address ending in docs.

# Addresses and common rules

By default the server listens on port 8000 of the local computer. All requests start with the same address, and the live connection uses the same address with the web socket scheme.

| Item | Value |
|---|---|
| Base address | http://localhost:8000 |
| Swagger page | http://localhost:8000/docs |
| Live connection base | ws://localhost:8000 |
| Format | JSON, character set UTF-8 |
| Identifiers | UUID text, for example 09e68225-3e69-460e-b24d-1f984dfd5b07 |
| Dates | ISO 8601 with a time zone, in UTC |

When a request is wrong, the server answers with an error code and a short explanation.

| Code | Meaning | Body |
|---|---|---|
| 404 | The transcript does not exist | A detail field with the text Transcription not found |
| 422 | A value is missing, has the wrong type or is out of range | A detail list that names each problem |

# The transcript record

A transcript is the main thing the server stores. It has a title, the full text, the languages that were detected, the length of the recording and a word count that the server calculates. The record returned for a single transcript also carries its segments.

| Field | Type | Meaning |
|---|---|---|
| id | text | Identifier of the transcript |
| title | text, 1 to 200 characters | Name shown in lists |
| content | text, up to 1,000,000 characters | The full transcribed text |
| detected_languages | list of text | Language codes such as hi and en |
| duration_seconds | number | Length of the recording in seconds |
| word_count | whole number | Words in the content, counted by the server |
| status | text | Always completed in this version |
| created_at, updated_at | date and time | When the record was created and last changed |
| segments | list | Only in the single record. Each entry has id, sequence_number, text, language, start_time, end_time and is_final |

Example of a stored transcript:

```json
{
  "id": "09e68225-3e69-460e-b24d-1f984dfd5b07",
  "title": "आज weather बहुत अच्छा है",
  "content": "आज weather बहुत अच्छा है and I want to go outside.",
  "detected_languages": ["hi", "en"],
  "duration_seconds": 12.0,
  "word_count": 10,
  "status": "completed",
  "created_at": "2026-11-25T07:22:14Z",
  "updated_at": "2026-11-25T07:22:14Z"
}
```

# Requests for transcripts

These requests cover the full life of a transcript. The table gives an overview, and the sections after it explain the details.

| Request | Path | Purpose | Success |
|---|---|---|---|
| POST | /api/transcriptions | Create a transcript | 201 with the full record |
| GET | /api/transcriptions | List transcripts, a page at a time | 200 with a page of records |
| GET | /api/transcriptions/{id} | Read one transcript with its segments | 200 with the full record |
| PUT | /api/transcriptions/{id} | Change the title or the text | 200 with the changed record |
| DELETE | /api/transcriptions/{id} | Delete a transcript and its segments | 204 with no body |
| GET | /api/languages | List every language code in use | 200 with a list of text |

## Creating a transcript

The client sends the text and, if it has them, the languages, the length of the recording and the segments. When no title is sent, the server uses the first six words of the text. The server counts the words itself, so the client does not send a count.

| Field | Required | Limits |
|---|---|---|
| content | Yes | Up to 1,000,000 characters |
| title | No | 1 to 200 characters |
| detected_languages | No | Up to 20 entries |
| duration_seconds | No | Zero or more |
| segments | No | Up to 5,000 entries. Each has text, and may have language, start_time, end_time and is_final |

## Listing transcripts

The answer is one page of records together with the total, so a client can build page controls. All filters are optional and can be combined.

| Parameter | Default | Meaning |
|---|---|---|
| page | 1 | Page number, from 1 |
| page_size | 20 | Records per page, from 1 to 100 |
| q | none | Text to find in the title or the content, ignoring capital letters |
| language | none | Only transcripts that include this language code |
| date_from | none | Earliest creation date, as YYYY-MM-DD, included |
| date_to | none | Latest creation date, as YYYY-MM-DD, included |
| sort | newest | Either newest or oldest, by creation date |

The answer has the fields items, total, page and page_size.

## Changing and deleting

A change request may carry a new title, new text, or both. When the text changes, the server counts the words again. Deleting a transcript also deletes its segments. A request for an identifier that does not exist receives the 404 answer.

# Dashboard figures

One request returns the figures shown on the dashboard page. The request is GET /api/dashboard/stats.

| Field | Meaning |
|---|---|
| total_transcriptions | Number of saved transcripts |
| total_words | Sum of the word counts |
| total_duration_seconds | Sum of the recording lengths |
| latest | The newest transcript, or nothing when none exist |

# Health check

The request GET /api/health answers 200 when the server is running. The answer names the speech engine and the model size in use, for example the engine faster_whisper and the model small. The Docker setup uses this request to decide when the server is ready.

# The live connection

The live connection is the part that turns speech into text. The client opens a WebSocket at the path /ws/transcribe/{session_id}, where the session identifier is any text the client chooses, such as a UUID. The server uses it only in its log.

Before the connection is accepted, the server checks the origin of the page. When an origin is present and is not in the allowed list, the server closes the connection with code 1008.

## What the client sends

| Message | Form | Meaning |
|---|---|---|
| Sound | Binary | 16-bit little endian samples, one channel, 16,000 samples per second. At most 320,000 bytes per message, which is about 10 seconds |
| pause | JSON with the field type set to pause | Settle the text so far. The connection stays open |
| stop | JSON with the field type set to stop | Settle the text, send the closing answer and close |

## What the server sends

| Message type | Other fields | Meaning |
|---|---|---|
| ready | none | The session is open and sound can be sent |
| interim | text | Live text that may still change. It replaces the previous live text. Empty text clears it |
| final | seq, text, language, languages, start, end | Settled text. The client appends it. It is never sent twice |
| paused | none | The answer to a pause message |
| done | duration, languages | The answer to a stop message. The server closes the connection afterwards |
| error | message, fatal | A problem. When fatal is true the server closes the connection |

The server sends an error that is not fatal when a sound message is empty, has an odd number of bytes, or is too large. It does the same when the session passes 3,600 seconds of sound, or when a text message is not valid JSON. A fatal error means the speech engine could not start or failed.

## Example of a session

The lines below show the order of messages for a short sentence. Lines that start with the client are sent by the web page, and lines that start with the server are sent by the server.

```text
client  sends sound, one message every half second
server  sends {"type":"interim","text":"आज weather"}
server  sends {"type":"final","seq":1,"text":"आज weather बहुत अच्छा है","language":"hi","languages":["hi","en"],"start":0.0,"end":3.4}
server  sends {"type":"interim","text":"and I want"}
client  sends {"type":"stop"}
server  sends {"type":"final","seq":2,"text":"and I want to go outside.","language":"hi","languages":["hi","en"],"start":3.6,"end":6.1}
server  sends {"type":"interim","text":""}
server  sends {"type":"done","duration":6.5,"languages":["hi","en"]}
```

The live connection does not save anything. After the session, the client saves the final text with the create request.

# Limits

| Limit | Value |
|---|---|
| Size of one sound message | 320,000 bytes |
| Sound in one session | 3,600 seconds |
| Length of one transcript | 1,000,000 characters |
| Records per page | 100 |
| Segments in one create request | 5,000 |

# Glossary

| Term | Meaning |
|---|---|
| WebSocket | A connection that stays open so that both sides can send messages at any time |
| JSON | A plain text format for structured data |
| UUID | A long unique identifier made of letters and digits |
| Origin | The web address of the page that makes a request |
| Final text | Text that the server regards as settled |
| Live text | The newest text, which may still change |
| Segment | One sentence or phrase with a start and an end time |
