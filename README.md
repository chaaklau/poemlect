# Poemlect

**Poemlect** is an interactive digital humanities visualization tool that explores the soundscapes of the *Three Hundred Tang Poems* (唐詩三百首) across time and dialects. It bridges the gap between historical linguistics and modern appreciation by offering a comparative view of rhyme schemes in Middle Chinese (using Tupa romanization), Cantonese, and Modern Mandarin.

The application features a responsive reader that visualizes rhyme adherence in real-time, highlighting how phonological shifts over a millennium have altered the auditory experience of Tang poetry. A specialized statistics dashboard provides a "heat map" view, allowing users to instantly gauge which poems maintain their original rhyme structure in modern dialects versus those that have drifted.

Built with vanilla JavaScript and Python for data processing, Poemlect serves as both an educational resource and an aesthetic experiment, demonstrating that while the characters remain constant, the "voice" of the poem evolves. It draws inspiration from visualization projects like *Poemage* and utilizes open-source linguistic libraries to reconstruct these historical soundscapes.

## Features

- **Multi-dialect Romanization**: 
  - **Middle Chinese**: Uses Tupa romanization to approximate the original sound of the Tang Dynasty.
  - **Cantonese**: Uses Jyutping to show how the Southern dialect preserves many auditory features.
  - **Mandarin**: Uses Pinyin to contrast with the modern standard language.
- **Interactive Rhyme Visualization**: Color-coded rhyme markers that adapt based on the selected language, ignoring notes and punctuation.
- **Statistical Heatmap**: A dense grid visualization showing rhyme preservation across 300+ poems for all three languages.
- **Deep Linking**: Share specific poems and language views via URL parameters.

## Data & Acknowledgements

This project stands on the shoulders of open-source linguistic tools and data repositories:

### Poetry Corpus
- **[chinese-poetry](https://github.com/chinese-poetry/chinese-poetry)**: The source text for the *Three Hundred Tang Poems*. (MIT License)

### Linguistic Libraries (Python)
- **[ToMiddleChinese](https://github.com/CanCLID/ToMiddleChinese)**: Used for Middle Chinese (Tupa) romanization.
- **[ToJyutping](https://github.com/CanCLID/ToJyutping)**: Used for Cantonese romanization.
- **[pypinyin](https://github.com/mozillazg/python-pinyin)**: Used for Mandarin Pinyin generation.

### Inspirations
- **[Poemage](http://www.poemage.org/)**: For concepts in visualizing the sonic topology of poetry.
- **Shakespeare's Sonnets Visualizations**: Various DH projects that visualize rhyme and structure.
- **Gemini 3 Pro**: AI collaborator for code generation and refactoring.

## Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/chaaklau/poemlect.git
   ```
2. (Optional) Re-generate data:
   The `data/poems_augmented.json` is pre-generated. If you wish to modify the processing logic:
   ```bash
   pip install -r requirements.txt
   python augment_poems.py
   ```
3. Run the app:
   Since this is a static site, you can serve it with any static server.
   ```bash
   python -m http.server 8000
   # Open http://localhost:8000 in your browser
   ```

## License

This project is licensed under the MIT License - see the LICENSE file for details.
