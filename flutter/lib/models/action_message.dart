class ActionMessage {
  const ActionMessage.ok(this.text) : ok = true;
  const ActionMessage.failed(this.text) : ok = false;

  final bool ok;
  final String text;
}
