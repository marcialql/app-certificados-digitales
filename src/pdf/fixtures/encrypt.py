# Genera encrypted.pdf: blank.pdf protegido con contraseña de usuario "secreto" (RC4 128).
import sys
from pypdf import PdfReader, PdfWriter

src, dst = sys.argv[1], sys.argv[2]
writer = PdfWriter(clone_from=PdfReader(src))
writer.encrypt(user_password="secreto", owner_password="secreto-propietario", algorithm="RC4-128")
with open(dst, "wb") as f:
    writer.write(f)
