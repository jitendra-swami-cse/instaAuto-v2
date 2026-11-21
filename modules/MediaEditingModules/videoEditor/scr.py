import subprocess
import os

def apply_overlay(input_file, output_file):
    script_dir = os.path.dirname(os.path.abspath(__file__))
    command = [
        'ffmpeg',
        '-i', input_file,
        '-ignore_loop', '0',
        '-i', os.path.join(script_dir, 'top_right.gif'),
        '-ignore_loop', '0',
        '-i', os.path.join(script_dir, 'top_left.gif'),
        '-filter_complex', '[0:v][1:v] overlay=W-w+75:-75:shortest=1 [v1]; [v1][2:v] overlay=-75:-75:shortest=1 [v]',
        '-map', '[v]',
        '-map', '0:a?',
        '-c:a', 'copy',
        output_file
    ]
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    print(f"apply_overlay: Processing {input_file} to {output_file}")
    if result.stderr:
        print(f"apply_overlay Error: {result.stderr}")
    return result.stderr

def apply_bottom_overlay(input_file, output_file):
    script_dir = os.path.dirname(os.path.abspath(__file__))
    command = [
        'ffmpeg',
        '-i', input_file,
        '-ignore_loop', '0',
        '-i', os.path.join(script_dir, 'bottom_right.gif'),
        '-ignore_loop', '0',
        '-i', os.path.join(script_dir, 'bottom_left.gif'),
        '-filter_complex', '[0:v][1:v] overlay=W-w+75:H-h+75:shortest=1 [v1]; [v1][2:v] overlay=-75:H-h+75:shortest=1 [v]',
        '-map', '[v]',
        '-map', '0:a?',
        '-c:a', 'copy',
        output_file
    ]
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    print(f"apply_bottom_overlay: Processing {input_file} to {output_file}")
    if result.stderr:
        print(f"apply_bottom_overlay Error: {result.stderr}")
    return result.stderr

def apply_blur(input_file, output_file):
    command = [
        'ffmpeg',
        '-i', input_file,
        '-vf', 'boxblur=5:1',
        output_file
    ]
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    print(f"apply_blur: Processing {input_file} to {output_file}")
    if result.stderr:
        print(f"apply_blur Error: {result.stderr}")
    return result.stderr

def scale_overlay(input_file, output_file):
    initial_scale_factor = 'scale=iw*0.98:ih*0.98'
    current_scale_factor = initial_scale_factor
    scale_step = 0.01
    max_retries = 10
    retry_count = 0

    while retry_count < max_retries:
        result_errors = apply_scale(input_file, output_file, current_scale_factor)

        if 'not divisible by 2' in result_errors:
            print(f"scale_overlay Error: Encountered with scale factor: {current_scale_factor}")

            # Delete the produced video file if it exists
            if os.path.exists(output_file):
                os.remove(output_file)

            current_scale_value = float(current_scale_factor.split('*')[1].split(':')[0]) - scale_step
            new_scale_factor = f'scale=iw*{current_scale_value:.2f}:ih*{current_scale_value:.2f}'

            current_scale_factor = new_scale_factor
            print(f"scale_overlay: Retrying with new scale factor: {current_scale_factor}")

            retry_count += 1
        else:
            break
    return result_errors

def apply_scale(input_file, output_file, scale_factor):
    command = [
        'ffmpeg',
        '-i', input_file,
        '-vf', scale_factor,
        '-c:v', 'libx264',
        '-crf', '18',
        '-c:a', 'copy',
        output_file
    ]
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    print(f"apply_scale: Processing {input_file} with scale factor {scale_factor} to {output_file}")
    if result.stderr:
        print(f"apply_scale Error: {result.stderr}")
    return result.stderr

def apply_overlay_to_background(background_file, overlay_file, output_file):
    command = [
        'ffmpeg',
        '-i', background_file,
        '-i', overlay_file,
        '-filter_complex', '[1:v]scale=iw*0.8:ih*0.8 [ov]; [0:v][ov]overlay=(W-w)/2:(H-h)/2',
        '-c:v', 'libx264',
        '-crf', '18',
        '-c:a', 'copy',
        output_file
    ]
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    print(f"apply_overlay_to_background: Processing background {background_file} with overlay {overlay_file} to {output_file}")
    if result.stderr:
        print(f"apply_overlay_to_background Error: {result.stderr}")
    return result.stderr

def process_video(video_file):
    """
    Process a single video file through the editing steps.
    Outputs the final edited video as 'edited_<original_name>' in the same directory.
    """
    if not os.path.exists(video_file):
        print(f"Error: Video file {video_file} does not exist.")
        return False

    print(f"Starting processing for {video_file}")
    base_name = os.path.basename(video_file)
    dir_name = os.path.dirname(video_file) or '.'
    final_output_file = os.path.join(dir_name, f"edited_{base_name}")

    if os.path.exists(final_output_file):
        print(f"Final output file {final_output_file} already exists. Skipping processing.")
        return True

    overlayed1_file = os.path.join(dir_name, f"overlayed1_{base_name}")
    apply_overlay(video_file, overlayed1_file)
    if not os.path.exists(overlayed1_file):
        print(f"Error: First overlay step failed for {video_file}")
        return False

    overlayed2_file = os.path.join(dir_name, f"overlayed2_{base_name}")
    apply_bottom_overlay(overlayed1_file, overlayed2_file)
    if not os.path.exists(overlayed2_file):
        print(f"Error: Second overlay step failed for {video_file}")
        os.remove(overlayed1_file)
        return False

    background_file = os.path.join(dir_name, f"background_{base_name}")
    apply_blur(video_file, background_file)
    if not os.path.exists(background_file):
        print(f"Error: Blur step failed for {video_file}")
        os.remove(overlayed1_file)
        os.remove(overlayed2_file)
        return False

    overlay_vid_file = os.path.join(dir_name, f"overlay_vid_{base_name}")
    scale_overlay(overlayed2_file, overlay_vid_file)
    if not os.path.exists(overlay_vid_file):
        print(f"Error: Scale overlay step failed for {video_file}")
        os.remove(overlayed1_file)
        os.remove(overlayed2_file)
        os.remove(background_file)
        return False

    apply_overlay_to_background(background_file, overlay_vid_file, final_output_file)
    if not os.path.exists(final_output_file):
        print(f"Error: Final overlay step failed for {video_file}")
        os.remove(overlayed1_file)
        os.remove(overlayed2_file)
        os.remove(background_file)
        os.remove(overlay_vid_file)
        return False

    # Clean up intermediate files
    try:
        os.remove(overlayed1_file)
        os.remove(overlayed2_file)
        os.remove(background_file)
        os.remove(overlay_vid_file)
        print(f"Successfully processed {video_file} to {final_output_file}")
    except Exception as e:
        print(f"Warning: Could not clean up intermediate files for {video_file}. Error: {e}")

    return True

def main():
    import sys
    if len(sys.argv) < 2:
        print("Error: No video file path provided. Usage: python scr.py <video_file_path>")
        sys.exit(1)

    video_file = sys.argv[1]
    success = process_video(video_file)
    sys.exit(0 if success else 1)
    
if __name__ == "__main__":
    main()
