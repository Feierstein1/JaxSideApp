# Screening starter terms (P15.9, D134)

`starter-terms.json` is the starter list of slurs for text screening (posts, comments, topics,
bios, usernames). The seed adds any term that's missing; terms changed or turned off in the
admin portal's Screening page stay as the admin left them. Ordinary profanity is deliberately
not included (D56).

- **BLOCK**: refused with a message.
- **HOLD**: saved hidden and sent to the moderation queue (terms that also have innocent uses).

## Sources and licenses

- **grawlix-racism 1.0.2** by Jon Stout, MIT License, Copyright (c) 2017 Jon Stout.
  https://github.com/tinwatchman/grawlix-racism. Racial slurs (the word list; the package's
  code is not used).
- **List of Dirty, Naughty, Obscene, and Otherwise Bad Words** (English), Shutterstock and
  contributors, Creative Commons Attribution 4.0 International (CC BY 4.0).
  https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words.
  Only the slurs were taken from it (selection by JaxSide); no profanity.

This list is a starting point. Moderators add local terms and new slang in the admin portal.
