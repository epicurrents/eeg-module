# HED-SCORE term index

[generate_index.py](generate_index.py) regenerates [src/components/vocabulary/hed-score.json](../../src/components/vocabulary/hed-score.json), the term index a finding picker reads, from a merged HED-SCORE schema release. Nothing here runs in the browser or in the package build. Standard library only.

The input is the merged XML of the SCORE library with its partnered HED standard, `HED_score_<version>.xml` from [hed-standard/hed-schemas](https://github.com/hed-standard/hed-schemas/tree/main/library_schemas/score/hedxml). The schema is not vendored here; pass the file a consuming platform pins, so the two read the same bytes.

```sh
python generate_index.py --schema path/to/HED_score_2.1.0.xml --out ../../src/components/vocabulary/hed-score.json
```

The output keeps the SCORE nodes and the HED standard's artifact subtree, which SCORE 2 moved there, one per line so a new release diffs by term, with the release's version and the SHA-256 of the input. A consumer compares that digest with its own pin rather than trusting the version string. The units are listed in full per unit class, SI prefixes applied, with the schema's default unit for each class.

The schema is CC-BY-4.0, and the index is an adaptation of it: the generated file carries an `attribution` field naming the source, the licence and the changes, and the package [NOTICE](../../NOTICE) repeats it.
