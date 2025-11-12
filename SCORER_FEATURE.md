# Goal Scorer Selection Feature

## Overview
The application now supports optional goal scorer selection when adding match results for both **Group Stage** and **Knockout Stage** matches.

## Features

### 🎯 Core Functionality
- **Optional Selection**: Scorers are completely optional - you can add results without specifying who scored
- **Automatic Display**: Scorer section appears automatically when goals are entered
- **Collapsible UI**: Show/Hide toggle to keep the interface clean
- **Two-Team Layout**: Side-by-side display of home and away team players
- **Injury Awareness**: Automatically disables injured players based on match date

### ✅ Validation
- **Total Goals Match**: If scorers are entered, their total goals must match the final score
  - Example: 3-2 match requires exactly 5 total goals from scorers (3 home + 2 away)
- **Injured Players Disabled**: Players injured on match date cannot be selected as scorers
- **Real-time Feedback**: Visual indicators show when scorers have goals assigned

### 🏆 Knockout Stage Support
- **All Match Types**: Works for semi-finals, finals, and 3rd place playoffs
- **Penalty Shootout Compatible**: Scorer selection works alongside penalty shootout input
- **Separate Modal**: Knockout matches use their own dedicated modal system

## User Interface

### Visual Elements
- **Player Cards**: Each player shown with number badge and name
- **Goal Input**: Number input field (0-99) for each player
- **Injury Badge**: 🤕 Red badge shown for injured players
- **Active State**: Green highlight when player has goals assigned
- **Disabled State**: Red tint with disabled cursor for injured players

### Dark Mode
- Full dark mode support for all scorer UI elements
- Adjusted colors for readability in dark theme
- Consistent styling across all match types

## How to Use

### Group Stage Matches
1. Navigate to **Fixtures** tab
2. Click **Add Result** on any fixture
3. Enter home and away scores
4. Scorer section appears automatically if goals > 0
5. Click **Show Scorers** to expand
6. Enter number of goals for each scorer
7. Click **Add Result** to save

### Knockout Stage Matches
1. Navigate to **Knockout** tab
2. Click **Add Result** on a knockout match
3. Enter home and away scores
4. If scores are tied, penalty shootout appears
5. Scorer section appears automatically if goals > 0
6. Click **Show Scorers** to expand
7. Enter number of goals for each scorer
8. Click **Add Result** to save

## Data Structure

### Stored Data Format
Scorers are stored in the match result object as an array:

```json
{
  "homeScore": 3,
  "awayScore": 2,
  "scorers": [
    {
      "playerId": "john-smith",
      "playerName": "John Smith",
      "goals": 2
    },
    {
      "playerId": "mike-jones",
      "playerName": "Mike Jones",
      "goals": 1
    },
    {
      "playerId": "opponent-player",
      "playerName": "Opponent Player",
      "goals": 2
    }
  ]
}
```

### Storage Locations
- **Group Stage**: `group-stage-results.json` - scorers array in each fixture result
- **Knockout Stage**: `knockout-stage-results.json` - scorers array in knockout match results

## Technical Implementation

### Files Modified
1. **index.html**: Added scorer section to knockout modal template
2. **css/styles.css**: Scorer styles already exist from group stage implementation
3. **js/script.js**: 
   - Added knockout-specific scorer functions
   - Updated modal rendering to include scorers
   - Added validation for knockout scorers
   - Integrated with existing penalty shootout logic

### Key Functions
- `toggleKnockoutScorers()` - Show/hide scorer section
- `updateKnockoutScorerInputs()` - Auto-show when goals > 0
- `renderKnockoutScorerInputs()` - Render player lists for both teams
- `collectKnockoutScorersData()` - Extract scorer data from inputs
- `validateKnockoutScorers()` - Validate total goals match score
- `saveKnockoutScoreModal()` - Updated to save scorers with result

### Shared Functions
The following functions are reused for both group and knockout stages:
- `isPlayerInjured()` - Date-based injury checking
- `renderTeamScorers()` - Renders player list with injury detection

## Examples

### Example 1: Simple 2-1 Result
```
Home Team: 2 goals
- Player A: 1 goal
- Player B: 1 goal

Away Team: 1 goal
- Player C: 1 goal
```

### Example 2: Hat-trick
```
Home Team: 3 goals
- Player A: 3 goals

Away Team: 0 goals
- (no scorers needed)
```

### Example 3: Multiple Scorers
```
Home Team: 4 goals
- Player A: 2 goals
- Player B: 1 goal
- Player C: 1 goal

Away Team: 2 goals
- Player D: 1 goal
- Player E: 1 goal
```

## Notes

- Scorers are **optional** - you can leave them empty
- If you start entering scorers, you must complete them (totals must match)
- Injured players are automatically detected based on injury dates in `teams.json`
- The feature works for both regular time goals and doesn't interfere with penalty shootouts
- See `INJURY_TRACKING.md` for details on how to track player injuries

## Future Enhancements (Potential)
- Display scorers in match result popups
- Filter/search players by name
- Show scorer statistics (top scorers, goals per match)
- Export scorer data to CSV
- Assist tracking (who provided the assist)
- Goal timing (minute of each goal)
