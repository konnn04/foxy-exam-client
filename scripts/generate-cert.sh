#!/bin/bash
set -e

CERT_DIR="$(dirname "$0")/../certs"
mkdir -p "$CERT_DIR"

SUBJECT="/CN=Foxy Exam/O=KLTN HCMUE/L=Ho Chi Minh/C=VN"

openssl req -x509 -newkey rsa:4096 \
  -keyout "$CERT_DIR/signing-key.pem" \
  -out "$CERT_DIR/signing-cert.pem" \
  -days 365 -nodes \
  -subj "$SUBJECT" 2>/dev/null

openssl pkcs12 -export \
  -inkey "$CERT_DIR/signing-key.pem" \
  -in "$CERT_DIR/signing-cert.pem" \
  -out "$CERT_DIR/signing.pfx" \
  -passout pass:foxy-exam-kltn 2>/dev/null

echo "✅ Certificates generated in certs/"
openssl x509 -in "$CERT_DIR/signing-cert.pem" -noout -subject -dates
