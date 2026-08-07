/// A transient status line for the token-management actions.
///
/// [ok] is the state; [text] is only ever text. Keep them separate: encoding
/// "this failed" into the string (a prefix, an icon, a marker character) forces
/// the widget to parse the message back apart, and that parser is wrong the
/// first time a message legitimately starts with the marker.
class ActionMessage {
  const ActionMessage.ok(this.text) : ok = true;
  const ActionMessage.failed(this.text) : ok = false;

  final bool ok;
  final String text;
}
