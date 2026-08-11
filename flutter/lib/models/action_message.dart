/// A transient status line. [ok] is the state; [text] is only ever text.
/// Encoding "this failed" into the string would force the widget to parse the
/// message back apart.
class ActionMessage {
  const ActionMessage.ok(this.text) : ok = true;
  const ActionMessage.failed(this.text) : ok = false;

  final bool ok;
  final String text;
}
