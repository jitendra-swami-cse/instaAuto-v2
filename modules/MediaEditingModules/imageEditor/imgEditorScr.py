import os
import subprocess
from PIL import Image

def process_image(currInputImg):
    counter = 1
    log_file_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "process_log.txt")
    counter_file_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "counter.txt")
    
    if os.path.exists(counter_file_path):
        with open(counter_file_path, "r") as counter_file:
            counter = int(counter_file.read())
        counter += 1

    log_entry = f"{counter}.  {currInputImg}\n"
    with open(log_file_path, "a") as log_file:
        log_file.write(log_entry)

    with open(counter_file_path, "w") as counter_file:
        counter_file.write(str(counter))

    return counter

def get_image_list_and_save_to_file():
    imglist = [filename for filename in os.listdir() if filename.endswith(('.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.webp'))]
    list_file_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "listOfImages.txt")
    with open(list_file_path, "w") as file:
        for image in imglist:
            file.write(image + '\n')
    return imglist

def apply_blur(currInputImg, blur_radius=2):
    print(f"Applying blur to {currInputImg}")
    output_file = os.path.join(os.path.dirname(currInputImg), "blurryBack.jpg")
    result = subprocess.run([
        "ffmpeg",
        "-i", currInputImg,
        "-vf", f"boxblur={blur_radius}:{blur_radius}",
        "-q:v", "1",
        "-update", "1",
        output_file
    ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode != 0:
        print(f"Error in apply_blur for {currInputImg}: {result.stderr}")
        raise RuntimeError(f"FFmpeg failed in apply_blur for {currInputImg}")
    return output_file

def resize_image(currInputImg, scale_factor=0.96):
    output_file = os.path.join(os.path.dirname(currInputImg), "currResizedImg.png")
    print(f"Resizing {currInputImg}")
    result = subprocess.run([
        "ffmpeg",
        "-i", currInputImg,
        "-vf", f"scale=iw*{scale_factor}:ih*{scale_factor}:flags=lanczos",
        "-update", "1",
        output_file
    ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode != 0:
        print(f"Error in resize_image for {currInputImg}: {result.stderr}")
        raise RuntimeError(f"FFmpeg failed in resize_image for {currInputImg}")
    return output_file

def get_image_dimensions(input_file):
    with Image.open(input_file) as img:
        wImg, hImg = img.size
    return wImg, hImg

def resize_masks(wImg, hImg, highOpacityOverlay, output_dir):
    script_dir = os.path.dirname(os.path.abspath(__file__))
    overlay_mask = os.path.join(script_dir, "highOpacityOverlayMask.png") if highOpacityOverlay else os.path.join(script_dir, "lowOpacityOverlayMask.png")
    vignette_mask = os.path.join(script_dir, "highOpacityVignetteMask.png") if highOpacityOverlay else os.path.join(script_dir, "lowOpacityVignetteMask.png")
    resized_overlay_mask = os.path.join(output_dir, "resizedHighOpacityOverlayMask.png") if highOpacityOverlay else os.path.join(output_dir, "resizedLowOpacityOverlayMask.png")
    resized_vignette_mask = os.path.join(output_dir, "resizedHighOpacityVignetteMask.png") if highOpacityOverlay else os.path.join(output_dir, "resizedLowOpacityVignetteMask.png")

    print(f"Resizing {vignette_mask}")
    result = subprocess.run([
        "ffmpeg",
        "-i", vignette_mask,
        "-vf", f"scale={wImg}:{hImg}:flags=lanczos",
        "-update", "1",
        resized_vignette_mask
    ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode != 0:
        print(f"Error in resize_masks for {vignette_mask}: {result.stderr}")
        raise RuntimeError(f"FFmpeg failed in resize_masks for {vignette_mask}")

    print(f"Resizing {overlay_mask}")
    result = subprocess.run([
        "ffmpeg",
        "-i", overlay_mask,
        "-vf", f"scale={wImg}:{hImg}:flags=lanczos",
        "-update", "1",
        resized_overlay_mask
    ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode != 0:
        print(f"Error in resize_masks for {overlay_mask}: {result.stderr}")
        raise RuntimeError(f"FFmpeg failed in resize_masks for {overlay_mask}")

    return resized_overlay_mask, resized_vignette_mask

def overlay_images(input_file, highOpacityOverlay, output_dir):
    output_file = os.path.join(output_dir, "currOverlayedImg.png")
    resized_overlay_mask = os.path.join(output_dir, "resizedHighOpacityOverlayMask.png") if highOpacityOverlay else os.path.join(output_dir, "resizedLowOpacityOverlayMask.png")
    resized_vignette_mask = os.path.join(output_dir, "resizedHighOpacityVignetteMask.png") if highOpacityOverlay else os.path.join(output_dir, "resizedLowOpacityVignetteMask.png")
    print(f"Overlaying masks on {input_file}")
    filter_complex = f"[0:v][1:v]overlay=0:0[overlay1];[overlay1][2:v]overlay=0:0"
    result = subprocess.run([
        "ffmpeg",
        "-i", input_file,
        "-i", resized_overlay_mask,
        "-i", resized_vignette_mask,
        "-filter_complex", filter_complex,
        "-update", "1",
        output_file
    ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode != 0:
        print(f"Error in overlay_images for {input_file}: {result.stderr}")
        raise RuntimeError(f"FFmpeg failed in overlay_images for {input_file}")
    return output_file

def overlay_images_with_center(outputImageName, input_file, blurry_back_file, mirrorImage=True):
    print(f"Creating final output {outputImageName}")
    filter_complex = "[0:v][1:v]overlay=(W-w)/2:(H-h)/2"
    if mirrorImage:
        filter_complex = f"[1:v]hflip[v1];[0:v][v1]overlay=(W-w)/2:(H-h)/2"
    quality_params = ["-q:v", "1"] if outputImageName.endswith('.jpg') else ["-quality", "90", "-preset", "picture"]
    result = subprocess.run([
        "ffmpeg",
        "-i", blurry_back_file,
        "-i", input_file,
        "-filter_complex", filter_complex,
        *quality_params,
        "-update", "1",
        outputImageName
    ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode != 0:
        print(f"Error in overlay_images_with_center for {outputImageName}: {result.stderr}")
        raise RuntimeError(f"FFmpeg failed in overlay_images_with_center for {outputImageName}")

def process_single_image(image_path, mirrorImage=True, highOpacityOverlay=False):
    """
    Process a single image file through the editing steps.
    Outputs the final edited image as 'edited_<high_opac/low_opac>_<original_name>' in the same directory.
    """
    if not os.path.exists(image_path):
        print(f"Error: Image file {image_path} does not exist.")
        return False

    print(f"Starting processing for {image_path}")
    base_name = os.path.basename(image_path)
    dir_name = os.path.dirname(image_path) or '.'
    output_ext = '.webp' if image_path.endswith('.webp') else '.jpg'
    outputImageName = os.path.join(dir_name, f"edited_{'high_opac' if highOpacityOverlay else 'low_opac'}_{os.path.splitext(base_name)[0]}{output_ext}")

    if os.path.exists(outputImageName):
        print(f"Final output file {outputImageName} already exists. Skipping processing.")
        return True

    try:
        blurry_back_file = apply_blur(image_path, blur_radius=2)
        resized_file = resize_image(image_path)
        wImg, hImg = get_image_dimensions(resized_file)
        resized_overlay_mask, resized_vignette_mask = resize_masks(wImg, hImg, highOpacityOverlay, dir_name)
        overlayed_file = overlay_images(resized_file, highOpacityOverlay, dir_name)
        overlay_images_with_center(outputImageName, overlayed_file, blurry_back_file, mirrorImage)
        process_image(image_path)
        print(f"Successfully processed {image_path} to {outputImageName}")
    except Exception as e:
        print(f"Error processing {image_path}: {e}")
        return False
    finally:
        temp_files = [blurry_back_file, resized_file, overlayed_file, resized_overlay_mask, resized_vignette_mask]
        for temp_file in temp_files:
            if os.path.exists(temp_file):
                try:
                    os.remove(temp_file)
                except Exception as e:
                    print(f"Warning: Could not clean up temporary file {temp_file}. Error: {e}")

    return True

def main():
    import sys
    if len(sys.argv) < 2:
        print("Error: No image file path provided. Usage: python imgEditorScr.py <image_file_path> [mirrorImage] [highOpacityOverlay]")
        sys.exit(1)

    image_path = sys.argv[1]
    mirrorImage = sys.argv[2].lower() == 'true' if len(sys.argv) > 2 else True
    highOpacityOverlay = sys.argv[3].lower() == 'true' if len(sys.argv) > 3 else False

    success = process_single_image(image_path, mirrorImage, highOpacityOverlay)
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
