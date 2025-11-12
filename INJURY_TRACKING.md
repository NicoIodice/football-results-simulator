# Player Injury Tracking System

## Overview
The application now supports tracking player injuries. Injured players will be automatically disabled in the scorer selection UI when adding match results.

## How to Add Injury Data

### Option 1: Add injury to an existing player in `teams.json`

Add an `injury` object to any player in the `teams.json` file:

```json
{
  "id": "player-id",
  "name": "Player Name",
  "number": 10,
  "position": "midfielder",
  "status": "injured",
  "isStarter": true,
  "isCaptain": false,
  "injury": {
    "startDate": "2025-10-15",
    "endDate": "2025-11-05",
    "reason": "Ankle sprain"
  }
}
```

### Injury Object Properties

- **`startDate`** (required): Date when the injury occurred (format: `YYYY-MM-DD`)
- **`endDate`** (optional): Date when player returns to fitness (format: `YYYY-MM-DD`)
  - If omitted, player is considered injured indefinitely
- **`reason`** (optional): Description of the injury (e.g., "Hamstring strain", "Concussion")

### Examples

#### Example 1: Short-term injury (1 week)
```json
"injury": {
  "startDate": "2025-10-20",
  "endDate": "2025-10-27",
  "reason": "Minor muscle strain"
}
```

#### Example 2: Long-term injury (indefinite)
```json
"injury": {
  "startDate": "2025-09-30",
  "reason": "ACL tear - season ending"
}
```

#### Example 3: Player recovered (injury in the past)
```json
"injury": {
  "startDate": "2025-09-15",
  "endDate": "2025-10-01",
  "reason": "Hamstring - fully recovered"
}
```

## How It Works

### When Adding Match Results

1. **Enter the score** for home and away teams
2. **Scorers section appears** automatically when goals are scored
3. **Player list shows** all players from both teams with:
   - ✅ **Available players**: Can be selected as scorers
   - 🤕 **Injured players**: Grayed out with "Injured" badge, cannot score goals
4. **Injury status determined** by match date:
   - If match date is before injury start date → Player is available
   - If match date is during injury period → Player is disabled
   - If match date is after injury end date → Player is available again

### Visual Indicators

- **Injured players**:
  - Red background tint
  - Red player number badge
  - 🤕 "Injured" badge
  - Input field disabled
  - Cursor shows "not-allowed"

- **Active scorers**:
  - Green background when goals > 0
  - Green border highlight
  - Goals input field enabled

## Validation Rules

1. **Optional Scorers**: You can add results without specifying scorers
2. **Goals Must Match**: If you enter scorers, total goals must match the score
   - Example: Home 3-2 Away requires exactly 3 home scorers' goals and 2 away scorers' goals
3. **Injured Players Cannot Score**: Injured players' input fields are disabled

## Tips

- Update the `status` field to `"injured"` for clarity (optional, not required for functionality)
- Use clear injury reasons for reference
- Set realistic end dates based on injury severity
- Remove the `injury` object completely when player fully recovers

## Full Player Example

```json
{
  "id": "john-smith",
  "name": "John Smith",
  "number": 7,
  "position": "forward",
  "status": "injured",
  "isStarter": true,
  "isCaptain": false,
  "injury": {
    "startDate": "2025-10-18",
    "endDate": "2025-11-08",
    "reason": "Broken toe - 3 weeks recovery"
  }
}
```

## Testing the Feature

1. Add an injury to a player in `teams.json`
2. Refresh the application
3. Go to Fixtures tab
4. Click "Add Result" on a match
5. Enter scores with goals
6. Click "Show" on the scorers section
7. Verify injured players are disabled

---

**Note**: The injury tracking only affects the scorer selection UI. It does not prevent players from appearing in team lineups or formations.
