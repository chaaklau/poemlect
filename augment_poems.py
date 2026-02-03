import json
import re
import traceback
from pypinyin import pinyin, Style
import ToJyutping
import ToMiddleChinese

def get_rhyme_final(pronunciation, lang):
    """
    Extracts the 'rhyme' part (final) from a syllable.
    """
    if not pronunciation:
        return ""
    
    s = pronunciation.lower().strip()
    
    if lang == 'cmn':
        # Pinyin: remove tone digits
        s = re.sub(r'\d+', '', s)
        # Remove initials
        s = re.sub(r'^(zh|ch|sh|b|p|m|f|d|t|n|l|g|k|h|j|q|x|r|z|c|s|y|w)', '', s)
        return s
        
    elif lang == 'yue':
        # Jyutping: remove tone digits
        s = re.sub(r'[1-6]', '', s) 
        # Initials removal
        s = re.sub(r'^(gw|kw|ng|b|p|m|f|d|t|n|l|g|k|h|w|z|c|s|j)', '', s)
        return s
        
    elif lang == 'lzt':
        # Middle Chinese (Tupa)
        
        # 1. Ignore final q and h (tones)
        s = re.sub(r'[qh]$', '', s)
        
        # 2. Strip initials (consonants) to find start of rhyme
        # Tupa characters can be complex. We search for the first vowel-like char.
        # We assume rhymes start with a, e, i, o, u, y
        match = re.search(r'[aeiouy]+.*', s)
        if not match:
            return s # No vowel found?
            
        rhyme_part = match.group(0)
        
        # 3. Glide i u y doesn't matter
        # logic: remove i/u/y from the START of the rhyme part, 
        # BUT only if they are acting as glides (followed by another vowel).
        # e.g. 'ian' -> 'an' (i is glide)
        #      'in'  -> 'in' (i is nucleus)
        #      'uan' -> 'an'
        #      'un'  -> 'un'
        
        # We use a loop to handle multiple glides if any (e.g. uai?)
        # Or simple regex substitution.
        # Remove leading [iuy] if lookahead sees [aeiouy]
        
        # Note: 'y' behavior in Tupa can be tricky, but assuming it follows same rule.
        
        clean_rhyme = re.sub(r'^[iuy]+(?=[aeiouy])', '', rhyme_part)
        
        return clean_rhyme

def process_poems():
    print("Loading poems...")
    with open('data/poems.json', 'r', encoding='utf-8') as f:
        poems = json.load(f)

    processed_poems = []
    
    for i, poem in enumerate(poems):
        if (i+1) % 50 == 0:
            print(f"Processing {i+1}/{len(poems)}...")
        
        new_content = []
        raw_lines = poem.get('content', [])
        if isinstance(raw_lines, str):
            raw_lines = [raw_lines]
        
        # Normalization: Split lines that contain sentence terminators in the middle
        # User requested splitting after: 。 ， ？
        # We also need to handle standardizing brackets for notes
        normalized_lines = []
        for line in raw_lines:
            # First, normalize brackets to full width for easier parsing later, or just handle both
            # Let's handle both dynamically in the char loop, but splitting is easier if we just regex split
            # Be careful not to split INSIDE notes. 
            # Simple heuristic: Split by delimiters, but keep delimiters attached to the left part usually.
            
            # Using regex to split, keeping the delimiter. 
            # delimiters: [。，？]
            # But wait, if we split by comma, we might break the couplets too aggressively? 
            # User said: "When a line break is missing after 。 or ， or ？ , add one."
            # This implies they WANT aggressive splitting.
            
            # Implementation: Replace delimiters with "delimiter\n" then split by \n
            # But don't do it if it's inside parentheses.
            
            # State machine for splitting
            # normalized_lines is cumulative for all raw_lines in the poem
            buffer = ""
            current_line_chars = 0
            in_paren = False
            sentence_terminated = False
            
            # Helper to peek next significant char
            def peek_is_bracket(start_idx, text):
                for k in range(start_idx, len(text)):
                    c = text[k]
                    if c.isspace(): continue
                    return c in ['（', '(']
                return False

            for idx, char in enumerate(line):
                buffer += char
                
                if char in ['（', '(']:
                    in_paren = True
                    
                # Check if it's a content char (excluding notes)
                if not in_paren and '\u4e00' <= char <= '\u9fff':
                    current_line_chars += 1
                
                if char in ['）', ')']:
                    in_paren = False
                    # If we deferred a split, do it now
                    if sentence_terminated:
                        normalized_lines.append(buffer)
                        buffer = ""
                        current_line_chars = 0
                        sentence_terminated = False
                    continue
                
                if not in_paren and char in ['。', '？', '！']:
                    # Only split if we have enough content (>= 10 chars)
                    if current_line_chars >= 10:
                        # Check lookahead for bracket
                        if peek_is_bracket(idx + 1, line):
                            sentence_terminated = True
                        else:
                            normalized_lines.append(buffer)
                            buffer = ""
                            current_line_chars = 0
                            sentence_terminated = False

            if buffer:
                normalized_lines.append(buffer)
                
        for line_text in normalized_lines:
            # We will produce a compact "line" object
            # Format: { "text": "...", "data": [[char, cmn, yue, lzt, cmn_r, yue_r, lzt_r, is_note_flag], ...] }
            
            line_data = []
            
            # Detect notes: usually inside （...）
            # We parse char by char, maintaining a "in_note" state.
            
            in_note = False
            
            # Pinyin works best sentence-wise
            cmn_list = pinyin(line_text, style=Style.TONE3, heteronym=False)
            cmn_flat = [x[0] for x in cmn_list]
            
            # Others we do sentence-wise calls but align char-by-char later?
            # Or just call char by char to be safe about alignment.
            # Calling libraries chars-by-chars is slower but safer for index alignment.
            # But line_text has punctuation.
            
            # Optimization: Pre-calculate sentence results?
            # ToJyutping and ToMiddleChinese return strings.
            # length of string words might not match length of string chars if punctuation involved differently.
            # Let's stick to char-by-char or careful alignment to ensure robustness.
            # Given we want to process 300 poems, char-by-char is acceptable (~20k chars).
            
            for idx, char in enumerate(line_text):
                is_note_char = 0
                
                if char == '（' or char == '(':
                    in_note = True
                    is_note_char = 1 
                elif char == '）' or char == ')':
                    in_note = False
                    is_note_char = 1
                elif in_note:
                    is_note_char = 1
                
                pron_cmn = ""
                pron_yue = ""
                pron_lzt = ""
                rhyme_cmn = ""
                rhyme_yue = ""
                rhyme_lzt = ""
                
                # Check if Chinese char
                if '\u4e00' <= char <= '\u9fff' and not is_note_char and not in_note: 
                    # Only calculate pronunciations/rhymes for actual poem text
                    try:
                        # Use the pre-calculated pinyin list to get context-aware pinyin
                        if idx < len(cmn_flat):
                            pron_cmn = cmn_flat[idx]
                        else:
                            pron_cmn = pinyin(char, style=Style.TONE3)[0][0]

                        pron_yue = ToJyutping.get_jyutping_text(char)
                        pron_lzt = ToMiddleChinese.get_tupa_text(char)
                        
                        rhyme_cmn = get_rhyme_final(pron_cmn, 'cmn')
                        rhyme_yue = get_rhyme_final(pron_yue, 'yue')
                        rhyme_lzt = get_rhyme_final(pron_lzt, 'lzt')
                        
                    except Exception:
                        pass
                
                # Even for notes/punct, we push the row, just empty prons
                # Compact row: [char, cmn, yue, lzt, cmn_r, yue_r, lzt_r, is_note]
                # To save space, we can omit trailing empty strings? No, array index matters.
                # But we can use short names.
                # Actually, sending [char, cmn, yue, lzt, cmn_r, yue_r, lzt_r, is_note] is fine.
                
                # Further compaction? 
                # If char is punct/note, prons are empty.
                
                line_data.append([
                    char, 
                    pron_cmn, 
                    pron_yue, 
                    pron_lzt, 
                    rhyme_cmn, 
                    rhyme_yue, 
                    rhyme_lzt, 
                    is_note_char
                ])

            new_content.append({
                "text": line_text,
                "data": line_data
            })
            
        processed_poems.append({
            "id": i+1,
            "title": poem.get('title'),
            "author": poem.get('author'),
            "type": poem.get('type'),
            "content": new_content
        })

    print("Saving compacted JSON...")
    
    # Custom JSON writing to ensure one poem per line for readability
    with open('data/poems_augmented.json', 'w', encoding='utf-8') as f:
        f.write('[\n')
        for i, poem in enumerate(processed_poems):
            # separators removes whitespace within the object
            json_str = json.dumps(poem, ensure_ascii=False, separators=(',', ':'))
            f.write('  ' + json_str)
            if i < len(processed_poems) - 1:
                f.write(',\n')
            else:
                f.write('\n')
        f.write(']')

if __name__ == "__main__":
    try:
        process_poems()
    except Exception as e:
        import traceback
        with open('error_log.txt', 'w') as f:
            traceback.print_exc(file=f)

