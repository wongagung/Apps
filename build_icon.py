import os
from PIL import Image, ImageDraw, ImageFilter

def create_clay_glass_icon():
    size = 256
    # Master image with RGBA
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Base Squircle Background with Clay depth
    # Draw soft shadow first
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow)
    sdraw.rounded_rectangle([20, 24, 236, 240], radius=56, fill=(0, 0, 0, 120))
    shadow = shadow.filter(ImageFilter.GaussianBlur(16))
    img.alpha_composite(shadow)

    # Base background squircle
    base_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bdraw = ImageDraw.Draw(base_layer)
    bdraw.rounded_rectangle([24, 24, 232, 232], radius=52, fill=(13, 20, 36, 255))
    
    # Outer stroke / rim light
    bdraw.rounded_rectangle([24, 24, 232, 232], radius=52, outline=(56, 189, 248, 140), width=3)
    img.alpha_composite(base_layer)

    # Monitor Glass Screen (Glassmorphism backdrop)
    glass = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glass)
    # Glass screen body
    gdraw.rounded_rectangle([45, 50, 211, 155], radius=16, fill=(30, 41, 59, 160), outline=(148, 163, 184, 80), width=2)
    # Monitor stand
    gdraw.rectangle([118, 156, 138, 178], fill=(51, 65, 85, 220))
    gdraw.rounded_rectangle([95, 176, 161, 186], radius=4, fill=(71, 85, 105, 240))
    img.alpha_composite(glass)

    # Wireless beam waves between monitor and phone
    waves = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    wdraw = ImageDraw.Draw(waves)
    # Arc waves in glowing cyan
    wdraw.arc([60, 55, 196, 190], start=210, end=330, fill=(6, 182, 212, 180), width=4)
    wdraw.arc([75, 70, 181, 175], start=215, end=325, fill=(59, 130, 246, 220), width=3)
    waves = waves.filter(ImageFilter.GaussianBlur(1))
    img.alpha_composite(waves)

    # Claymorphic Floating Mobile Phone in the foreground
    # Phone shadow
    pshadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pdraw_s = ImageDraw.Draw(pshadow)
    pdraw_s.rounded_rectangle([135, 95, 215, 225], radius=24, fill=(0, 0, 0, 160))
    pshadow = pshadow.filter(ImageFilter.GaussianBlur(10))
    img.alpha_composite(pshadow)

    # Phone Clay Body
    phone = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pdraw = ImageDraw.Draw(phone)
    # Outer inflated clay pill body (cyan to blue vibrant)
    pdraw.rounded_rectangle([130, 90, 210, 220], radius=22, fill=(14, 165, 233, 255), outline=(56, 189, 248, 255), width=2)
    
    # Phone Screen Glass inset
    pdraw.rounded_rectangle([138, 100, 202, 204], radius=14, fill=(15, 23, 42, 255), outline=(6, 182, 212, 160), width=1)
    
    # Dynamic Island / Notch
    pdraw.rounded_rectangle([160, 104, 180, 109], radius=3, fill=(51, 65, 85, 255))
    
    # Mirroring symbol inside phone screen (play / cast radiating circle)
    pdraw.ellipse([155, 137, 185, 167], fill=(6, 182, 212, 60), outline=(56, 189, 248, 220), width=2)
    pdraw.polygon([(166, 146), (166, 158), (177, 152)], fill=(255, 255, 255, 255))
    
    # Home bar
    pdraw.rounded_rectangle([160, 196, 180, 199], radius=2, fill=(148, 163, 184, 180))

    # Clay Specular Highlight (Soft gloss reflection on top left of phone)
    pdraw.arc([133, 93, 175, 140], start=180, end=270, fill=(255, 255, 255, 180), width=3)

    img.alpha_composite(phone)

    # Save PNG and ICO
    os.makedirs("./src/desktop", exist_ok=True)
    os.makedirs("./build", exist_ok=True)
    
    png_path = "./src/desktop/icon.png"
    ico_path = "./src/desktop/icon.ico"
    build_ico_path = "./build/icon.ico"
    build_png_path = "./build/icon.png"

    img.save(png_path, format="PNG")
    img.save(build_png_path, format="PNG")

    # Generate multi-size ICO (256, 128, 64, 48, 32, 16)
    icon_sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
    img.save(ico_path, format="ICO", sizes=icon_sizes)
    img.save(build_ico_path, format="ICO", sizes=icon_sizes)
    print("Icon generated successfully at:", png_path, ico_path, build_ico_path)

if __name__ == "__main__":
    create_clay_glass_icon()

