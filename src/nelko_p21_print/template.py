import base64
import io
import xml.etree.ElementTree as ET
import xml.sax.saxutils as saxutils
import qrcode
import cairosvg
from PIL import Image

def generate_qr_base64(data: str) -> str:
    """
    Generate a QR code image from the provided data, and return it as a base64 encoded PNG data URL.
    """
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=1,
    )
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    png_bytes = buf.getvalue()
    
    b64_str = base64.b64encode(png_bytes).decode("ascii")
    return f"data:image/png;base64,{b64_str}"

def render_svg_template(svg_template_content: str, row_data: dict) -> Image.Image:
    """
    Replace text placeholders (e.g. {Product}) and QR image placeholders (e.g. id="qr_URL") 
    in the SVG template, render the output using cairosvg, and return it as a Pillow Image.
    """
    # Register namespaces to prevent ElementTree from stripping or changing prefix forms
    ET.register_namespace("", "http://www.w3.org/2000/svg")
    ET.register_namespace("xlink", "http://www.w3.org/1999/xlink")
    
    try:
        root = ET.fromstring(svg_template_content)
    except Exception as e:
        raise ValueError(f"Failed to parse SVG template XML: {e}")
        
    namespaces = {"svg": "http://www.w3.org/2000/svg", "xlink": "http://www.w3.org/1999/xlink"}
    
    # 1. Update QR code image nodes in the XML structure
    for img in root.findall(".//svg:image", namespaces):
        img_id = img.get("id", "")
        if img_id.startswith("qr_"):
            col_name = img_id[3:]
            if col_name in row_data:
                qr_val = str(row_data[col_name])
                qr_data_url = generate_qr_base64(qr_val)
                # Set both href formats to be safe across different SVG engines
                img.set("href", qr_data_url)
                img.set(f"{{{namespaces['xlink']}}}href", qr_data_url)
                
    # 2. Serialize tree back to string
    modified_svg_bytes = ET.tostring(root, encoding="utf-8")
    modified_svg_str = modified_svg_bytes.decode("utf-8")
    
    # 3. Replace text placeholders (escaping special XML characters in the CSV values)
    for key, val in row_data.items():
        placeholder = f"{{{key}}}"
        escaped_val = saxutils.escape(str(val))
        modified_svg_str = modified_svg_str.replace(placeholder, escaped_val)
        
    # 4. Render to PNG using cairosvg
    png_bytes = cairosvg.svg2png(bytestring=modified_svg_str.encode("utf-8"))
    
    return Image.open(io.BytesIO(png_bytes))
